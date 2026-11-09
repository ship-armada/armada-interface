// ABOUTME: Barrel export for app-local UI primitives — AddressText, AddressReveal, FullAddress, CopyAddressButton, CopyableAddress, Card, ChainSelect, Modal, SectionHeader.
// ABOUTME: Re-exports each primitive plus its prop/variant types. Add a line here when a new primitive lands.

export { AddressText } from './AddressText'
export type { AddressTextProps } from './AddressText'

export { AddressReveal } from './AddressReveal'
export type { AddressRevealProps } from './AddressReveal'

export { FullAddress } from './FullAddress'
export type { FullAddressProps } from './FullAddress'

export { CopyAddressButton } from './CopyAddressButton'
export type { CopyAddressButtonProps } from './CopyAddressButton'

export { CopyableAddress } from './CopyableAddress'
export type { CopyableAddressProps } from './CopyableAddress'


export { Card } from './Card'
export type { CardProps, CardVariant } from './Card'

export { ChainSelect } from './ChainSelect'
export type { ChainSelectProps } from './ChainSelect'
export {
  SegmentedControl,
  type SegmentedControlLayout,
  type SegmentedControlOption,
  type SegmentedControlProps,
  type SegmentedControlSize,
  type SegmentedControlSurface,
} from './SegmentedControl'



export { Modal } from './Modal'
export type { ModalProps } from './Modal'


export { SectionHeader } from './SectionHeader'
export type { SectionHeaderProps } from './SectionHeader'


export { Tabs } from './Tabs'
export type { TabsProps, TabItem } from './Tabs'

export { ThemeToggle } from './ThemeToggle'


export { Tooltip } from './Tooltip'
export type { TooltipProps } from './Tooltip'


export { FeeBreakdownTooltip } from './FeeBreakdownTooltip'
export type { FeeBreakdownTooltipProps } from './FeeBreakdownTooltip'

export { GasBalanceNotice } from './GasBalanceNotice'
export type { GasBalanceNoticeProps } from './GasBalanceNotice'
