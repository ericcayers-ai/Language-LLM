export { colors, darkColors, fonts, tokens, showDiagnostics, showEvidence } from "./tokens.js";
export type { ColorToken } from "./tokens.js";

export {
  DENSITY_PROFILES,
  DENSITY_STORAGE_KEY,
  THEME_STORAGE_KEY,
  DEFAULT_DENSITY,
  DEFAULT_THEME,
  densityCssVars,
  isDensityProfile,
  isThemePreference,
  profileLabel,
  profileDescription,
} from "./density.js";
export type {
  DensityProfile,
  DensityTokenSet,
  ThemePreference,
} from "./density.js";

export { Button } from "./Button.js";
export type { ButtonProps, ButtonVariant } from "./Button.js";

export { ContextRibbon } from "./ContextRibbon.js";
export type { ContextRibbonItem, ContextRibbonProps } from "./ContextRibbon.js";

export { CaptionOverlay } from "./CaptionOverlay.js";
export type {
  CaptionOverlayProps,
  CaptionProvenanceLabel,
} from "./CaptionOverlay.js";

export { EvidenceGutter } from "./EvidenceGutter.js";
export type { EvidenceGutterProps, EvidenceItem } from "./EvidenceGutter.js";

export { focusRingStyle, focusRingClassName } from "./FocusRing.js";

export { TranscriptList } from "./TranscriptList.js";
export type { TranscriptItem, TranscriptListProps } from "./TranscriptList.js";

export { EmptyState } from "./EmptyState.js";
export type {
  EmptyStateAction,
  EmptyStateKind,
  EmptyStateProps,
} from "./EmptyState.js";

export { StatusRegion } from "./StatusRegion.js";
export type { StatusRegionProps, StatusTone } from "./StatusRegion.js";

export { PageTranslateToolbar } from "./PageTranslateToolbar.js";
export type {
  PageTranslateMode,
  PageTranslateToolbarProps,
} from "./PageTranslateToolbar.js";

export { ProfilePicker } from "./ProfilePicker.js";
export type { ProfilePickerProps } from "./ProfilePicker.js";

export { ReviewCard } from "./ReviewCard.js";
export type { ReviewCardProps } from "./ReviewCard.js";

export { DensityProvider, useDensity } from "./DensityProvider.js";
export type {
  DensityContextValue,
  DensityProviderProps,
} from "./DensityProvider.js";

export { TOKENS_CSS, injectTokenStyles } from "./shadowStyles.js";

export {
  overlayStateKey,
  shouldUpdateOverlay,
} from "./updateGate.js";
export type { OverlayVisualKey } from "./updateGate.js";
