import type { HTMLAttributes } from "react";
import { Button } from "./Button.js";
import {
  profileDescription,
  profileLabel,
  type DensityProfile,
} from "./density.js";

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
      className={["llm-profile", className].filter(Boolean).join(" ")}
      style={style}
      {...rest}
    >
      <legend>Density</legend>
      <div
        role="radiogroup"
        aria-label="Density profile"
        className="llm-profile__options"
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
        <p className="llm-profile__hint">{profileDescription(value)}</p>
      ) : null}
    </fieldset>
  );
}
