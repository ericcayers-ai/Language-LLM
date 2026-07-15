import type { HTMLAttributes } from "react";
import { Button } from "./Button.js";
import {
  profileDescription,
  profileLabel,
  type DensityProfile,
} from "./density.js";
import { colors, fonts } from "./tokens.js";

export interface ProfilePickerProps
  extends Omit<HTMLAttributes<HTMLFieldSetElement>, "onChange"> {
  value: DensityProfile;
  onChange: (profile: DensityProfile) => void;
  compact?: boolean;
}

const OPTIONS: DensityProfile[] = ["focus", "balanced", "expert"];

/** Focus / Balanced / Expert density preference control. */
export function ProfilePicker({
  value,
  onChange,
  compact = false,
  style,
  className,
  ...rest
}: ProfilePickerProps) {
  return (
    <fieldset
      className={className}
      style={{
        border: `1px solid color-mix(in srgb, ${colors.mutedSlate} 35%, transparent)`,
        borderRadius: 2,
        padding: compact ? "0.45rem 0.55rem" : "0.65rem 0.75rem",
        margin: 0,
        fontFamily: fonts.ui,
        ...style,
      }}
      {...rest}
    >
      <legend
        style={{
          fontSize: "0.8125rem",
          fontWeight: 600,
          padding: "0 0.25rem",
        }}
      >
        Density profile
      </legend>
      <div
        role="radiogroup"
        aria-label="Density profile"
        style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}
      >
        {OPTIONS.map((profile) => (
          <Button
            key={profile}
            variant={value === profile ? "primary" : "ghost"}
            aria-pressed={value === profile}
            onClick={() => onChange(profile)}
            style={{
              padding: compact ? "0.3rem 0.55rem" : "0.4rem 0.7rem",
              fontSize: "0.8125rem",
            }}
            title={profileDescription(profile)}
          >
            {profileLabel(profile)}
          </Button>
        ))}
      </div>
      {!compact ? (
        <p
          style={{
            margin: "0.5rem 0 0",
            fontSize: "0.75rem",
            color: colors.mutedSlate,
          }}
        >
          {profileDescription(value)}
        </p>
      ) : null}
    </fieldset>
  );
}
