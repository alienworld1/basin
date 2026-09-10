// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./BasinRouterActivation.sol";

interface ISettlementResolver {
    function data(bytes32 node, string calldata key) external view returns (bytes memory);
}

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice A fixed Sepolia USDC payment primitive. The organization controls
/// the obligation; the payee's current ENS settlement commitment controls its destination.
contract BasinRouter is BasinRouterActivation {
    uint256 public constant CHAIN_ID = 11155111;
    uint256 public constant MAX_OBLIGATION_WINDOW = 7 days;
    uint8 public constant SETTLEMENT_DESCRIPTOR_VERSION = 1;
    string public constant VERSION = "1";

    struct ApprovedPayeeRef {
        address organization;
        bytes32 relationshipNamehash;
        uint256 relationshipTokenId;
        bytes32 payeeId;
        bytes32 securityRootCommitment;
        address recipient;
        uint256 expiry;
    }

    struct SettlementDescriptorV1 {
        uint8 version;
        uint256 chainId;
        address asset;
        address destination;
        uint256 settlementEpoch;
        uint256 validFrom;
    }

    struct Obligation {
        address organization;
        bytes32 relationshipNamehash;
        uint256 relationshipTokenId;
        bytes32 payeeId;
        bytes32 securityRootCommitment;
        address recipient;
        uint256 relationshipExpiry;
        uint256 maxAmount;
        uint256 remainingAmount;
        uint256 validUntil;
        bytes32 metadataHash;
        bool exists;
        bool cancelled;
    }

    IERC20 public immutable asset;
    mapping(bytes32 => Obligation) private obligations;
    mapping(bytes32 => bool) public consumedPaymentIds;
    uint256 private unlocked = 1;

    event ObligationCreated(
        bytes32 indexed obligationId,
        address indexed organization,
        bytes32 indexed relationshipNamehash,
        uint256 relationshipTokenId,
        bytes32 payeeId,
        uint256 maxAmount,
        uint256 remainingAmount,
        address asset,
        uint256 validUntil,
        bytes32 metadataHash
    );
    event ObligationExecuted(
        bytes32 indexed paymentId,
        bytes32 indexed obligationId,
        address indexed organization,
        bytes32 relationshipNamehash,
        uint256 relationshipTokenId,
        bytes32 payeeId,
        uint256 settlementEpoch,
        bytes32 settlementCommitment,
        address destination,
        uint256 amount,
        address asset,
        bytes32 metadataHash,
        uint256 remainingAmount
    );
    event ObligationCancelled(bytes32 indexed obligationId, address indexed organization);

    modifier nonReentrant() {
        require(unlocked == 1, "reentrant call");
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(IApprovedPayeeEnsVerifier verifier, IERC20 asset_) BasinRouterActivation(verifier) {
        require(block.chainid == CHAIN_ID, "wrong chain");
        require(address(verifier) != address(0) && address(asset_) != address(0), "missing dependency");
        ensVerifier = verifier;
        asset = asset_;
    }

    function createObligation(
        bytes32 obligationId,
        ApprovedPayeeRef calldata approvedPayee,
        uint256 maxAmount,
        uint256 validUntil,
        bytes32 metadataHash,
        IApprovedPayeeEnsVerifier.VerificationContext calldata context
    ) external {
        require(msg.sender == approvedPayee.organization, "wrong organization");
        require(obligationId != bytes32(0) && !obligations[obligationId].exists, "used obligation");
        require(
            maxAmount > 0 && validUntil > block.timestamp &&
                validUntil <= block.timestamp + MAX_OBLIGATION_WINDOW &&
                validUntil <= approvedPayee.expiry,
            "invalid validity"
        );
        require(metadataHash != bytes32(0), "missing metadata");
        _verifyPayee(approvedPayee, context);
        obligations[obligationId] = Obligation({
            organization: approvedPayee.organization,
            relationshipNamehash: approvedPayee.relationshipNamehash,
            relationshipTokenId: approvedPayee.relationshipTokenId,
            payeeId: approvedPayee.payeeId,
            securityRootCommitment: approvedPayee.securityRootCommitment,
            recipient: approvedPayee.recipient,
            relationshipExpiry: approvedPayee.expiry,
            maxAmount: maxAmount,
            remainingAmount: maxAmount,
            validUntil: validUntil,
            metadataHash: metadataHash,
            exists: true,
            cancelled: false
        });
        emit ObligationCreated(obligationId, msg.sender, approvedPayee.relationshipNamehash,
            approvedPayee.relationshipTokenId, approvedPayee.payeeId, maxAmount, maxAmount,
            address(asset), validUntil, metadataHash);
    }

    function executeObligation(
        bytes32 obligationId,
        SettlementDescriptorV1 calldata descriptor,
        uint256 amount,
        bytes32 paymentId,
        IApprovedPayeeEnsVerifier.VerificationContext calldata context
    ) external nonReentrant {
        Obligation storage obligation = obligations[obligationId];
        require(obligation.exists && !obligation.cancelled && obligation.validUntil > block.timestamp, "inactive obligation");
        require(msg.sender == obligation.organization, "wrong organization");
        require(paymentId != bytes32(0) && !consumedPaymentIds[paymentId], "used payment");
        require(amount > 0 && amount == obligation.maxAmount && amount == obligation.remainingAmount, "wrong amount");
        ApprovedPayeeRef memory approvedPayee = ApprovedPayeeRef(
            obligation.organization, obligation.relationshipNamehash, obligation.relationshipTokenId,
            obligation.payeeId, obligation.securityRootCommitment, obligation.recipient, obligation.relationshipExpiry
        );
        _verifyPayee(approvedPayee, context);
        bytes32 commitment = _verifySettlement(obligation.relationshipNamehash, context.resolver, descriptor);
        consumedPaymentIds[paymentId] = true;
        obligation.remainingAmount = 0;
        require(asset.transferFrom(obligation.organization, descriptor.destination, amount), "transfer failed");
        emit ObligationExecuted(paymentId, obligationId, obligation.organization, obligation.relationshipNamehash,
            obligation.relationshipTokenId, obligation.payeeId, descriptor.settlementEpoch, commitment,
            descriptor.destination, amount, address(asset), obligation.metadataHash, 0);
    }

    function cancelObligation(bytes32 obligationId) external {
        Obligation storage obligation = obligations[obligationId];
        require(obligation.exists && !obligation.cancelled && obligation.remainingAmount > 0, "inactive obligation");
        require(msg.sender == obligation.organization, "wrong organization");
        obligation.cancelled = true;
        obligation.remainingAmount = 0;
        emit ObligationCancelled(obligationId, msg.sender);
    }

    function getObligation(bytes32 obligationId) external view returns (Obligation memory) { return obligations[obligationId]; }

    function _verifyPayee(ApprovedPayeeRef memory value, IApprovedPayeeEnsVerifier.VerificationContext calldata context) private view {
        require(value.organization != address(0) && value.recipient != address(0), "missing payee");
        require(value.expiry > block.timestamp, "expired relationship");
        (bytes32 commitment, bytes32 payeeId, uint256 expiry,) = BasinRouterActivationLike(address(this)).acceptedRoot(value.organization, value.relationshipNamehash, value.relationshipTokenId);
        // The full router deliberately owns a fresh activation set. The self-call keeps the
        // activation record layout compatible with the activation-only predecessor.
        require(commitment == value.securityRootCommitment && payeeId == value.payeeId && expiry == value.expiry, "missing activation");
        require(ensVerifier.verifyApprovedPayee(value.organization, value.relationshipNamehash, value.relationshipTokenId,
            value.payeeId, value.securityRootCommitment, value.recipient, value.expiry, context), "unsafe relationship");
    }

    function _verifySettlement(bytes32 relationshipNamehash, address resolver, SettlementDescriptorV1 calldata value) private view returns (bytes32) {
        require(value.version == SETTLEMENT_DESCRIPTOR_VERSION && value.chainId == CHAIN_ID && value.asset == address(asset)
            && value.destination != address(0) && value.validFrom <= block.timestamp, "invalid settlement");
        bytes memory record = ISettlementResolver(resolver).data(relationshipNamehash, "basin.settlement");
        require(record.length == 96, "invalid settlement record");
        (uint8 version, uint256 epoch, bytes32 commitment) = abi.decode(record, (uint8, uint256, bytes32));
        require(version == SETTLEMENT_DESCRIPTOR_VERSION && epoch == value.settlementEpoch, "stale settlement");
        bytes32 calculated = keccak256(abi.encode(value.version, value.chainId, value.asset, value.destination, value.settlementEpoch, value.validFrom));
        require(calculated == commitment, "settlement mismatch");
        return commitment;
    }

}

interface BasinRouterActivationLike {
    function acceptedRoot(address organization, bytes32 namehash, uint256 tokenId) external view returns (bytes32, bytes32, uint256, uint256);
}
