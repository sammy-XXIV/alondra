// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GuardianVault
/// @notice Holds a depositor's ETH and lets a designated AI agent pull funds out
///         to the depositor's own withdrawal address if it judges the position at risk.
///         The agent can never redirect funds anywhere other than the depositor's
///         pre-registered address, so a compromised/malicious agent can only ever
///         trigger an early exit, not a theft.
contract GuardianVault {
    struct Position {
        uint256 balance;
        address withdrawTo;
    }

    address public immutable agent;
    mapping(address => Position) public positions;

    event Deposited(address indexed depositor, uint256 amount, address withdrawTo);
    event Withdrawn(address indexed depositor, uint256 amount);
    event AgentExit(address indexed depositor, uint256 amount, string reason);

    error NotAgent();
    error NoPosition();
    error ZeroAmount();
    error TransferFailed();

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    constructor(address _agent) {
        agent = _agent;
    }

    /// @notice Deposit ETH under guard. `withdrawTo` is fixed at deposit time so the
    ///         agent can only ever send funds back to an address the depositor chose.
    function deposit(address withdrawTo) external payable {
        if (msg.value == 0) revert ZeroAmount();
        Position storage p = positions[msg.sender];
        p.balance += msg.value;
        p.withdrawTo = withdrawTo;
        emit Deposited(msg.sender, msg.value, withdrawTo);
    }

    /// @notice Depositor can withdraw their own funds at any time, no agent involved.
    function withdraw() external {
        Position storage p = positions[msg.sender];
        uint256 amount = p.balance;
        if (amount == 0) revert NoPosition();
        p.balance = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Agent-triggered emergency exit for a depositor's position. Funds only
    ///         ever move to that depositor's own pre-registered `withdrawTo` address.
    function agentExit(address depositor, string calldata reason) external onlyAgent {
        Position storage p = positions[depositor];
        uint256 amount = p.balance;
        if (amount == 0) revert NoPosition();
        p.balance = 0;
        (bool ok, ) = payable(p.withdrawTo).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit AgentExit(depositor, amount, reason);
    }

    function balanceOf(address depositor) external view returns (uint256) {
        return positions[depositor].balance;
    }
}
