// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @title BridgeVault
/// @notice Holds many users' deposits with per-user, per-token accounting. The
///         agent can trigger a bridge transaction for a specific user's specific
///         recorded balance only -- it can never touch another user's funds,
///         because the balance is decremented (checks-effects-interactions)
///         before the external bridge call is even made. If that call fails,
///         the whole transaction reverts and the user's balance is restored.
contract BridgeVault {
    address public immutable agent;

    // user => token => balance. address(0) token means native ETH.
    mapping(address => mapping(address => uint256)) public balances;

    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event BridgeExecuted(address indexed user, address indexed token, uint256 amount, address indexed callTarget, string bridgeName);

    error NotAgent();
    error InsufficientBalance();
    error ZeroAmount();
    error CallFailed();
    error TransferFailed();

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    constructor(address _agent) {
        agent = _agent;
    }

    /// @notice Deposit ERC-20 tokens under vault custody. Requires prior approval.
    function deposit(address token, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (!IERC20(token).transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        balances[msg.sender][token] += amount;
        emit Deposited(msg.sender, token, amount);
    }

    /// @notice Deposit native ETH under vault custody (e.g. to cover bridge gas/fees).
    function depositNative() external payable {
        if (msg.value == 0) revert ZeroAmount();
        balances[msg.sender][address(0)] += msg.value;
        emit Deposited(msg.sender, address(0), msg.value);
    }

    /// @notice Withdraw your own funds at any time. The agent is never involved.
    function withdraw(address token, uint256 amount) external {
        if (balances[msg.sender][token] < amount) revert InsufficientBalance();
        balances[msg.sender][token] -= amount;

        if (token == address(0)) {
            (bool ok, ) = payable(msg.sender).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            if (!IERC20(token).transfer(msg.sender, amount)) revert TransferFailed();
        }
        emit Withdrawn(msg.sender, token, amount);
    }

    /// @notice Agent-triggered bridge execution for one user's recorded balance.
    ///         Approves `approvalTarget` to pull `amount` of `token`, then calls
    ///         `callTarget` with `callData` (the bridge's own assembled transaction),
    ///         forwarding `bridgeValue` native ETH as the bridge's own fee.
    ///         `gasReimbursement` is paid to the agent (msg.sender) out of the
    ///         USER's own deposited native balance -- the agent's wallet is the
    ///         one that technically submits and fronts the transaction (unavoidable
    ///         at the protocol level), but it is made whole from the user's own
    ///         funds, so the user is the one who actually bears the cost.
    function executeBridge(
        address user,
        address token,
        uint256 amount,
        address approvalTarget,
        address callTarget,
        bytes calldata callData,
        uint256 bridgeValue,
        uint256 gasReimbursement,
        string calldata bridgeName
    ) external onlyAgent {
        if (balances[user][token] < amount) revert InsufficientBalance();
        balances[user][token] -= amount;

        uint256 totalNativeCost = bridgeValue + gasReimbursement;
        if (totalNativeCost > 0) {
            if (balances[user][address(0)] < totalNativeCost) revert InsufficientBalance();
            balances[user][address(0)] -= totalNativeCost;
        }

        if (!IERC20(token).approve(approvalTarget, amount)) revert TransferFailed();

        (bool ok, ) = callTarget.call{value: bridgeValue}(callData);
        if (!ok) revert CallFailed();

        if (gasReimbursement > 0) {
            (bool sent, ) = payable(msg.sender).call{value: gasReimbursement}("");
            if (!sent) revert TransferFailed();
        }

        emit BridgeExecuted(user, token, amount, callTarget, bridgeName);
    }

    function balanceOf(address user, address token) external view returns (uint256) {
        return balances[user][token];
    }

    receive() external payable {
        balances[msg.sender][address(0)] += msg.value;
        emit Deposited(msg.sender, address(0), msg.value);
    }
}
