/**
 * Composed profile section rendered at the top of the account page
 * (feature 009-account-library, US1).
 *
 * Presentational — hosts the profile form + password change form inside
 * a single panel. State + submission live in each child component.
 */
import { ProfileForm } from "./ProfileForm";
import { ChangePasswordForm } from "./ChangePasswordForm";

export interface ProfileSectionProps {
  email: string;
  initialDisplayName: string;
}

export function ProfileSection({
  email,
  initialDisplayName,
}: ProfileSectionProps) {
  return (
    <section className="flex flex-col gap-8">
      <div className="panel p-6 flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h2 className="heading-display text-xl">Profile</h2>
          <p className="text-sm text-ink-dim">
            Update the name shown to your scorekeeping partners.
          </p>
        </header>
        <ProfileForm email={email} initialDisplayName={initialDisplayName} />
      </div>

      <div className="panel p-6 flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h2 className="heading-display text-xl">Password</h2>
          <p className="text-sm text-ink-dim">
            Change your password without signing out on this device.
          </p>
        </header>
        <ChangePasswordForm />
      </div>
    </section>
  );
}
