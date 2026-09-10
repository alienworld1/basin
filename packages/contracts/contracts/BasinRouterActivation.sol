// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Activation-only trust anchor. Payment execution is intentionally absent.
/// @dev The ENS verifier is immutable and must validate the current generation and
/// frozen permission profile directly from the configured ENSv2 deployment.
interface IApprovedPayeeEnsVerifier {
    struct VerificationContext {
        string identityLabel;
        string organizationLabel;
        address relationshipRegistry;
        address resolver;
        uint256 identityEpoch;
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
    ) external view returns (bool);
}

contract BasinRouterActivation {
    struct Acceptance {
        address organization;
        bytes32 relationshipNamehash;
        uint256 relationshipTokenId;
        bytes32 payeeId;
        bytes32 securityRootCommitment;
        uint256 expiry;
        uint256 nonce;
    }

    struct AcceptedRecord {
        bytes32 commitment;
        bytes32 payeeId;
        uint256 expiry;
        uint256 nonce;
    }

    bytes32 private constant ACCEPTANCE_TYPEHASH = keccak256(
        "AcceptApprovedPayee(address organization,bytes32 relationshipNamehash,uint256 relationshipTokenId,bytes32 payeeId,bytes32 securityRootCommitment,uint256 expiry,uint256 nonce)"
    );
    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant NAME_HASH = keccak256("BasinRouter");
    bytes32 private constant VERSION_HASH = keccak256("1");

    IApprovedPayeeEnsVerifier public immutable ensVerifier;
    mapping(bytes32 => AcceptedRecord) private records;
    mapping(bytes32 => uint256) public nextNonce;

    event ApprovedPayeeActivated(
        address indexed organization,
        bytes32 indexed relationshipNamehash,
        uint256 indexed relationshipTokenId,
        bytes32 payeeId,
        bytes32 securityRootCommitment,
        uint256 expiry,
        uint256 nonce
    );

    constructor(IApprovedPayeeEnsVerifier verifier) {
        require(address(verifier) != address(0), "missing verifier");
        ensVerifier = verifier;
    }

    function activateApprovedPayee(
        Acceptance calldata acceptance,
        address recipient,
        bytes calldata signature,
        IApprovedPayeeEnsVerifier.VerificationContext calldata context
    ) external {
        require(block.chainid == 11155111, "wrong chain");
        require(block.timestamp < acceptance.expiry, "expired");
        bytes32 key = _key(acceptance.organization, acceptance.relationshipNamehash, acceptance.relationshipTokenId);
        require(records[key].commitment == bytes32(0), "already accepted");
        require(acceptance.nonce == nextNonce[key], "wrong nonce");
        require(
            ensVerifier.verifyApprovedPayee(
                acceptance.organization,
                acceptance.relationshipNamehash,
                acceptance.relationshipTokenId,
                acceptance.payeeId,
                acceptance.securityRootCommitment,
                recipient,
                acceptance.expiry,
                context
            ),
            "unsafe relationship"
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), _hashAcceptance(acceptance)));
        require(_recover(digest, signature) == recipient, "invalid acceptance");
        nextNonce[key] = acceptance.nonce + 1;
        records[key] = AcceptedRecord(
            acceptance.securityRootCommitment,
            acceptance.payeeId,
            acceptance.expiry,
            acceptance.nonce
        );
        emit ApprovedPayeeActivated(
            acceptance.organization,
            acceptance.relationshipNamehash,
            acceptance.relationshipTokenId,
            acceptance.payeeId,
            acceptance.securityRootCommitment,
            acceptance.expiry,
            acceptance.nonce
        );
    }

    function acceptedRoot(address organization, bytes32 namehash, uint256 tokenId)
        external view returns (bytes32, bytes32, uint256, uint256)
    {
        AcceptedRecord memory record = records[_key(organization, namehash, tokenId)];
        return (record.commitment, record.payeeId, record.expiry, record.nonce);
    }

    function _key(address organization, bytes32 namehash, uint256 tokenId) private pure returns (bytes32) {
        return keccak256(abi.encode(organization, namehash, tokenId));
    }

    function _hashAcceptance(Acceptance calldata value) private pure returns (bytes32) {
        return keccak256(abi.encode(
            ACCEPTANCE_TYPEHASH, value.organization, value.relationshipNamehash,
            value.relationshipTokenId, value.payeeId, value.securityRootCommitment,
            value.expiry, value.nonce
        ));
    }

    function _domainSeparator() private view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address signer) {
        require(signature.length == 65, "invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        require(uint256(s) <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0, "invalid s");
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "invalid v");
        signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "invalid signer");
    }
}
