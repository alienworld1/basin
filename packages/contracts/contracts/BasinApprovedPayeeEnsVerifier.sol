// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./BasinRouterActivation.sol";

interface IPermissionedRegistry {
    struct NameState {
        uint8 status;
        uint64 expiry;
        address latestOwner;
        uint256 tokenId;
        uint256 resource;
    }

    function getState(uint256 anyId) external view returns (NameState memory);
    function getResolver(string calldata label) external view returns (address);
    function getSubregistry(string calldata label) external view returns (address);
    function getParent() external view returns (address, string memory);
    function roles(uint256 resource, address account) external view returns (uint256);
    function roleCount(uint256 resource) external view returns (uint256);
}

interface IPermissionedResolver {
    function data(bytes32 node, string calldata key) external view returns (bytes memory);
    function roles(uint256 resource, address account) external view returns (uint256);
    function roleCount(uint256 resource) external view returns (uint256);
}

interface IVerifiableFactory {
    function verifyContract(address proxy) external view returns (address);
}

/// @notice Verifies the exact ENSv2 generation and frozen permission profile
/// committed to by a recipient before a relationship can become active.
contract BasinApprovedPayeeEnsVerifier is IApprovedPayeeEnsVerifier {
    address private constant ROOT_REGISTRY = 0x8115186E8f2E0B0281e86ab91f0f48Ba90364354;
    address private constant ETH_REGISTRY = 0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2;
    address private constant USER_REGISTRY_IMPLEMENTATION = 0x624a25d67B59D587752EbEc8DdeD8827dAe52050;
    address private constant PERMISSIONED_RESOLVER_IMPLEMENTATION = 0x9EAe5C2730a7dD16BDD1DeE6421a1B91e3B0365e;
    address private constant VERIFIABLE_FACTORY = 0x10dC6333CDFe1FCEf624c6e0a8221b91804Cd7ef;
    uint256 private constant ROLE_REGISTRAR = 1 << 0;
    uint256 private constant ROLE_SET_PARENT = 1 << 8;
    uint256 private constant ROLE_UNREGISTER = 1 << 12;
    uint256 private constant ROLE_RENEW = 1 << 16;
    uint256 private constant ROLE_SET_DATA = 1 << 36;
    uint256 private constant ADMIN_SHIFT = 128;

    IPermissionedRegistry public immutable basinRegistry;

    constructor(address basinRegistry_) {
        require(basinRegistry_ != address(0), "missing registry");
        basinRegistry = IPermissionedRegistry(basinRegistry_);
    }

    function verifyApprovedPayee(
        address organization,
        bytes32 relationshipNamehash,
        uint256 relationshipTokenId,
        bytes32 payeeId,
        bytes32 securityRootCommitment,
        address recipient,
        uint256 expiry,
        VerificationContext calldata context
    ) external view returns (bool) {
        require(bytes(context.identityLabel).length != 0, "missing identity");
        require(bytes(context.organizationLabel).length != 0, "missing organization");
        require(
            IPermissionedRegistry(ROOT_REGISTRY).getSubregistry("eth") == ETH_REGISTRY &&
                IPermissionedRegistry(ETH_REGISTRY).getSubregistry("basin") == address(basinRegistry),
            "wrong registry"
        );

        bytes32 basinNode = _child(bytes32(0), "eth");
        basinNode = _child(basinNode, "basin");
        bytes32 identityNode = _child(basinNode, context.identityLabel);
        bytes32 organizationNode = _child(basinNode, context.organizationLabel);
        require(payeeId == identityNode, "wrong payee");
        require(
            relationshipNamehash == _child(organizationNode, context.identityLabel),
            "wrong relationship"
        );

        IPermissionedRegistry.NameState memory identity = basinRegistry.getState(
            uint256(keccak256(bytes(context.identityLabel)))
        );
        IPermissionedRegistry.NameState memory parent = basinRegistry.getState(
            uint256(keccak256(bytes(context.organizationLabel)))
        );
        require(
            identity.status == 2 && identity.expiry > block.timestamp && identity.latestOwner == recipient,
            "inactive identity"
        );
        require(
            parent.status == 2 && parent.expiry > block.timestamp && parent.latestOwner == organization,
            "inactive organization"
        );
        require(
            basinRegistry.getSubregistry(context.organizationLabel) == context.relationshipRegistry,
            "wrong relationship registry"
        );

        IPermissionedRegistry relationshipRegistry = IPermissionedRegistry(context.relationshipRegistry);
        (address parentRegistry, string memory parentLabel) = relationshipRegistry.getParent();
        require(
            parentRegistry == address(basinRegistry) &&
                keccak256(bytes(parentLabel)) == keccak256(bytes(context.organizationLabel)),
            "wrong parent"
        );
        IPermissionedRegistry.NameState memory relationship = relationshipRegistry.getState(
            relationshipTokenId
        );
        require(
            relationship.status == 2 && relationship.expiry == expiry &&
                relationship.latestOwner == recipient && relationship.tokenId == relationshipTokenId,
            "inactive relationship"
        );
        require(
            relationshipRegistry.getResolver(context.identityLabel) == context.resolver,
            "wrong resolver"
        );

        address identityResolver = basinRegistry.getResolver(context.identityLabel);
        bytes memory identityRecord = IPermissionedResolver(identityResolver).data(
            identityNode,
            "basin.identity"
        );
        (uint8 version, bytes32 recordedPayeeId, uint256 recordedEpoch) = abi.decode(
            identityRecord,
            (uint8, bytes32, uint256)
        );
        require(
            version == 1 && recordedPayeeId == payeeId && recordedEpoch == context.identityEpoch,
            "wrong identity record"
        );

        require(
            IVerifiableFactory(VERIFIABLE_FACTORY).verifyContract(context.relationshipRegistry) ==
                USER_REGISTRY_IMPLEMENTATION &&
                IVerifiableFactory(VERIFIABLE_FACTORY).verifyContract(context.resolver) ==
                PERMISSIONED_RESOLVER_IMPLEMENTATION,
            "unverified implementation"
        );

        uint256 nodeResource = uint256(keccak256(abi.encodePacked(relationshipNamehash, bytes32(0))));
        uint256 wildcardResource = uint256(
            keccak256(abi.encodePacked(bytes32(0), keccak256(bytes("basin.settlement"))))
        );
        uint256 recordResource = uint256(
            keccak256(abi.encodePacked(relationshipNamehash, keccak256(bytes("basin.settlement"))))
        );
        IPermissionedResolver resolver = IPermissionedResolver(context.resolver);
        uint256[4] memory resources = [uint256(0), nodeResource, wildcardResource, recordResource];
        uint256[4] memory counts;
        for (uint256 i; i < resources.length; ++i) counts[i] = resolver.roleCount(resources[i]);
        uint256 controllerRoles = resolver.roles(recordResource, recipient);
        require(
            counts[0] == 0 && counts[1] == 0 && counts[2] == 0 &&
                counts[3] == ROLE_SET_DATA && controllerRoles == ROLE_SET_DATA,
            "unsafe resolver roles"
        );

        uint256 rootCounts = relationshipRegistry.roleCount(0);
        uint256 nameCounts = relationshipRegistry.roleCount(relationship.resource);
        uint256 controllerRegistryRoot = relationshipRegistry.roles(0, recipient);
        uint256 parentRootCounts = basinRegistry.roleCount(0);
        uint256 parentCounts = basinRegistry.roleCount(parent.resource);
        uint256 payerRoles = ROLE_REGISTRAR | ROLE_UNREGISTER | ROLE_RENEW;
        uint256 payerMask = _roleCountMask(payerRoles | (payerRoles << ADMIN_SHIFT));
        uint256 upstreamRoles = ROLE_REGISTRAR | ROLE_SET_PARENT | ROLE_RENEW;
        uint256 upstreamMask = _roleCountMask(upstreamRoles | (upstreamRoles << ADMIN_SHIFT));
        require(
            rootCounts & ~payerMask == 0 && nameCounts == 0 && controllerRegistryRoot == 0 &&
                parentRootCounts & ~upstreamMask == 0 && parentCounts == 0,
            "unsafe registry roles"
        );

        bytes32 resolverProfile = keccak256(
            abi.encode(
                resources[0], resources[1], resources[2], resources[3],
                counts[0], counts[1], counts[2], counts[3], controllerRoles
            )
        );
        bytes32 registryProfile = keccak256(
            abi.encode(rootCounts, nameCounts, controllerRegistryRoot, parentRootCounts, parentCounts)
        );
        address resolverImplementation = IVerifiableFactory(VERIFIABLE_FACTORY).verifyContract(
            context.resolver
        );
        bytes32 root = keccak256(
            abi.encode(
                payeeId,
                recipient,
                context.identityEpoch,
                context.relationshipRegistry,
                relationshipTokenId,
                context.resolver,
                resolverImplementation,
                resolverImplementation.codehash,
                resolverProfile,
                registryProfile
            )
        );
        return root == securityRootCommitment;
    }

    function _child(bytes32 parent, string memory label) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(parent, keccak256(bytes(label))));
    }

    function _roleCountMask(uint256 roles) private pure returns (uint256 mask) {
        for (uint256 offset; offset < 256; offset += 4) {
            if (roles & (uint256(1) << offset) != 0) mask |= uint256(15) << offset;
        }
    }
}
