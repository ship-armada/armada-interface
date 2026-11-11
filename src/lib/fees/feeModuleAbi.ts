// ABOUTME: Minimal ABI for ArmadaFeeModule fee quotes used in the UI.
// ABOUTME: Only `calculateShieldFee(integrator, amount)` — useDisplayFees reads a shield's protocol fee with it at review.

export const feeModuleAbi = [
  {
    type: 'function',
    name: 'calculateShieldFee',
    stateMutability: 'view',
    inputs: [
      { name: 'integrator', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [
      { name: 'armadaTake', type: 'uint256' },
      { name: 'integratorFee', type: 'uint256' },
      { name: 'totalFee', type: 'uint256' },
    ],
  },
] as const
