import { FormEvent, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import {
  BellRing,
  BookOpen,
  Brush,
  CalendarCheck2,
  Check,
  ChefHat,
  Clock3,
  Coins,
  ConciergeBell,
  CreditCard,
  Eye,
  Languages,
  MailPlus,
  MapPin,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  UserCog,
  UserRound,
  UsersRound,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { DashboardPanel } from "@/components/dashboard/EmptyState";
import { GlassModal } from "@/components/ui/GlassModal";
import { currencyOptions, timeZoneOptions } from "@/lib/regional";
import { useAuthStore } from "@/stores/useAuthStore";
import type { MembershipRole, RestaurantMember } from "@/types";
import { api, uploadMedia } from "@/lib/api/client";

const CURRENCIES = currencyOptions();
const TIMEZONES = timeZoneOptions();

export default function RestaurantSettingsPage() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const restaurants = useAuthStore((state) => state.restaurants);
  const updateRestaurant = useAuthStore((state) => state.updateRestaurant);
  const addTeamMember = useAuthStore((state) => state.addRestaurantTeamMember);
  const removeTeamMember = useAuthStore((state) => state.removeRestaurantTeamMember);
  const restaurant = restaurants.find((item) => item.id === currentUser?.activeRestaurantId);
  const [invite, setInvite] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<MembershipRole, "owner">>("waiter");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [members, setMembers] = useState<RestaurantMember[]>([]);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [newOwnerId, setNewOwnerId] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const subscription = useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: api.billing,
    staleTime: 30_000,
  });

  const activeRestaurantId = restaurant?.id;

  useEffect(() => {
    if (!activeRestaurantId) return;
    let active = true;
    void api
      .restaurantMembers(activeRestaurantId)
      .then((rows) => {
        if (active) setMembers(rows);
      })
      .catch((error) => {
        if (active)
          setLifecycleError(error instanceof Error ? error.message : "Could not load staff.");
      });
    return () => {
      active = false;
    };
  }, [activeRestaurantId]);

  if (!restaurant || !currentUser) return null;
  const restaurantId = restaurant.id;
  const restaurantSnapshot = restaurant;
  const currentRole = currentUser.memberships.find(
    (membership) => membership.restaurantId === restaurantId,
  )?.role;
  const isOwner = currentRole === "owner";
  const hasOrders = subscription.data?.features.includes("orders") ?? false;

  function saveRestaurant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "");
    const cuisineType = String(form.get("cuisineType") ?? "");
    if (!name.trim() || !cuisineType.trim()) return;
    updateRestaurant(restaurantId, {
      name: name.trim(),
      cuisineType: cuisineType.trim(),
      currency: String(form.get("currency") ?? "EUR"),
      language: String(form.get("language") ?? "en"),
      timezone: String(form.get("timezone") ?? "Europe/Bucharest"),
    });
    setIsDirty(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  function checkForChanges(event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    setIsDirty(
      String(form.get("name") ?? "").trim() !== restaurantSnapshot.name ||
        String(form.get("cuisineType") ?? "").trim() !== restaurantSnapshot.cuisineType ||
        String(form.get("currency") ?? "EUR") !== restaurantSnapshot.currency ||
        String(form.get("language") ?? "en") !== (restaurantSnapshot.language ?? "en") ||
        String(form.get("timezone") ?? "") !== restaurantSnapshot.timezone,
    );
  }

  function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = invite.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return;
    addTeamMember(restaurantId, email, inviteRole);
    setInvite("");
    setInviteOpen(false);
  }
  async function uploadLogo(file: File) {
    setLogoError(null);
    try {
      const logoUrl = await uploadMedia(restaurantId, file);
      await updateRestaurant(restaurantId, { logoUrl });
    } catch (cause) {
      setLogoError(cause instanceof Error ? cause.message : "Logo upload failed.");
    }
  }

  async function transferOwnership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLifecycleError(null);
    try {
      await api.transferRestaurantOwnership(restaurantId, newOwnerId, ownerPassword);
      window.location.reload();
    } catch (cause) {
      setLifecycleError(cause instanceof Error ? cause.message : "Ownership transfer failed.");
    }
  }

  async function deleteRestaurant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLifecycleError(null);
    try {
      await api.deleteRestaurant(restaurantId, deletePassword, deleteConfirmation);
      localStorage.removeItem("astron_active_restaurant");
      window.location.assign("/dashboard");
    } catch (cause) {
      setLifecycleError(cause instanceof Error ? cause.message : "Restaurant deletion failed.");
    }
  }

  return (
    <DashboardPanel>
      <header className="module-page-heading restaurant-settings-heading">
        <p className="eyebrow">Restaurant settings</p>
        <h1>
          Everything about
          <br />
          <em>{restaurant.name}.</em>
        </h1>
        <p>Organised into clear sections so operational details stay easy to find and update.</p>
      </header>
      <nav className="settings-section-nav" aria-label="Settings sections">
        <a href="#general">General</a>
        <a href="#regional">Location & locale</a>
        <a href="#operations">Guest actions</a>
        <a href="#branding">Branding</a>
        <a href="#team">Staff</a>
      </nav>
      <div className="modern-settings-layout">
        <form
          className="modern-settings-main"
          key={restaurant.id}
          onSubmit={saveRestaurant}
          onChange={checkForChanges}
        >
          <SettingsSection
            id="general"
            icon={<UtensilsCrossed size={17} />}
            title="General information"
            note="The essential identity used across Astron."
          >
            <div className="settings-fields-two">
              <Field
                name="name"
                label="Restaurant name"
                icon={<Settings2 size={13} />}
                value={restaurant.name}
              />
              <Field
                name="cuisineType"
                label="Cuisine or service style"
                icon={<UtensilsCrossed size={13} />}
                value={restaurant.cuisineType}
              />
            </div>
          </SettingsSection>
          <SettingsSection
            id="regional"
            icon={<MapPin size={17} />}
            title="Location and locale"
            note="Controls currency, reporting dates and service time."
          >
            <div className="settings-fields-two">
              <SelectField
                name="currency"
                label="Currency"
                icon={<Coins size={13} />}
                value={restaurant.currency}
                options={CURRENCIES.map((option) => option.label)}
                values={CURRENCIES.map((option) => option.value)}
              />
              <SelectField
                name="language"
                label="Language"
                icon={<Languages size={13} />}
                value={restaurant.language ?? "en"}
                options={["English", "Română", "Français", "Deutsch", "Español"]}
                values={["en", "ro", "fr", "de", "es"]}
              />
              <SelectField
                name="timezone"
                label="Timezone"
                icon={<Clock3 size={13} />}
                value={restaurant.timezone}
                options={TIMEZONES.map((option) => option.label)}
                values={TIMEZONES.map((option) => option.value)}
              />
            </div>
          </SettingsSection>
          <SettingsSection
            id="branding"
            icon={<Brush size={17} />}
            title="Restaurant branding"
            note="Identity assets used in published experiences."
          >
            <label className="branding-upload">
              <span>
                <UploadCloud size={17} />
              </span>
              <div>
                <b>{restaurant.logoUrl ? "Replace restaurant mark" : "Upload restaurant mark"}</b>
                <small>PNG, JPG, WebP or AVIF · up to 10 MB</small>
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadLogo(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {logoError && (
              <p className="form-error" role="alert">
                {logoError}
              </p>
            )}
          </SettingsSection>
          <SettingsSection
            id="operations"
            icon={<Sparkles size={17} />}
            title="Guest actions"
            note="Choose which requests guests can make from your digital menu and booking page."
          >
            <div className="restaurant-operation-toggles">
              <OperationToggle
                icon={<CalendarCheck2 size={16} />}
                title="Reservations"
                note="Let guests book tables online."
                enabled={restaurant.reservationsEnabled ?? true}
                onToggle={() =>
                  updateRestaurant(restaurantId, {
                    reservationsEnabled: !(restaurant.reservationsEnabled ?? true),
                  })
                }
              />
              {hasOrders && (
                <OperationToggle
                  icon={<BellRing size={16} />}
                  title="Call waiter"
                  note="Show a call-waiter action at the table."
                  enabled={restaurant.callWaiterEnabled ?? true}
                  onToggle={() =>
                    updateRestaurant(restaurantId, {
                      callWaiterEnabled: !(restaurant.callWaiterEnabled ?? true),
                    })
                  }
                />
              )}
              {hasOrders && (
                <OperationToggle
                  icon={<CreditCard size={16} />}
                  title="Request check"
                  note="Let guests ask for the bill without waiting."
                  enabled={restaurant.requestCheckEnabled ?? true}
                  onToggle={() =>
                    updateRestaurant(restaurantId, {
                      requestCheckEnabled: !(restaurant.requestCheckEnabled ?? true),
                    })
                  }
                />
              )}
            </div>
          </SettingsSection>
          <footer className={`settings-save-bar ${isDirty ? "is-dirty" : ""}`}>
            <span>
              {saved && (
                <>
                  <Check size={13} /> Restaurant updated
                </>
              )}
            </span>
            <button className="button button-primary" type="submit">
              <Check size={15} /> Save changes
            </button>
          </footer>
        </form>
        <aside className="modern-settings-side">
          <section className="team-settings-card" id="team">
            <div className="settings-card-heading team-settings-heading">
              <span>
                <UsersRound size={18} />
              </span>
              <div>
                <h2>Staff and access</h2>
                <p>People working inside this restaurant.</p>
              </div>
              <button className="team-add-button" type="button" onClick={() => setInviteOpen(true)}>
                <Plus size={14} /> Add
              </button>
            </div>
            <div className="team-list">
              {members.map((member) => (
                <article key={member.userId}>
                  <span className="team-avatar">
                    {member.name
                      .split(" ")
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <div>
                    <b>{member.name}</b>
                    <small>{member.email}</small>
                  </div>
                  <em>{member.role}</em>
                </article>
              ))}
              {restaurant.teamInvites.map((email) => (
                <article key={email}>
                  <span className="team-avatar">
                    <UserRound size={15} />
                  </span>
                  <div>
                    <b>{email.split("@")[0].replace(/[._-]/g, " ")}</b>
                    <small>{email}</small>
                  </div>
                  <em>Invited</em>
                  <button
                    aria-label={`Remove ${email}`}
                    onClick={() => removeTeamMember(restaurant.id, email)}
                  >
                    <Trash2 size={14} />
                  </button>
                </article>
              ))}
            </div>
            <button
              className="team-invite-launcher"
              type="button"
              onClick={() => setInviteOpen(true)}
            >
              <span>
                <MailPlus size={16} />
              </span>
              <div>
                <b>Invite someone new</b>
                <small>Choose their access in the next step</small>
              </div>
              <Plus size={14} />
            </button>
          </section>
          {isOwner && (
            <section className="team-settings-card lifecycle-danger-zone">
              <div className="settings-card-heading">
                <span>
                  <Trash2 size={18} />
                </span>
                <div>
                  <h2>Owner controls</h2>
                  <p>These actions require your password and take effect immediately.</p>
                </div>
              </div>
              {lifecycleError && (
                <p className="form-error" role="alert">
                  {lifecycleError}
                </p>
              )}
              <form onSubmit={transferOwnership}>
                <label className="auth-field">
                  <span>Transfer ownership to</span>
                  <select
                    required
                    value={newOwnerId}
                    onChange={(event) => setNewOwnerId(event.target.value)}
                  >
                    <option value="">Choose an existing member</option>
                    {members
                      .filter((member) => member.userId !== currentUser.userId)
                      .map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.name} ({member.email})
                        </option>
                      ))}
                  </select>
                </label>
                <label className="auth-field">
                  <span>Current password</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    minLength={10}
                    required
                    value={ownerPassword}
                    onChange={(event) => setOwnerPassword(event.target.value)}
                  />
                </label>
                <button className="button" type="submit" disabled={!newOwnerId}>
                  Transfer ownership
                </button>
              </form>
              <form onSubmit={deleteRestaurant}>
                <label className="auth-field">
                  <span>Type {restaurant.name} to delete</span>
                  <input
                    required
                    value={deleteConfirmation}
                    onChange={(event) => setDeleteConfirmation(event.target.value)}
                  />
                </label>
                <label className="auth-field">
                  <span>Current password</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    minLength={10}
                    required
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                  />
                </label>
                <button
                  className="button lifecycle-delete-button"
                  type="submit"
                  disabled={deleteConfirmation !== restaurant.name}
                >
                  Delete restaurant permanently
                </button>
              </form>
            </section>
          )}
        </aside>
      </div>
      <AnimatePresence>
        {inviteOpen && (
          <GlassModal
            className="team-invite-modal"
            labelledBy="team-invite-title"
            onClose={() => setInviteOpen(false)}
          >
            <header>
              <div>
                <p className="eyebrow">Staff access</p>
                <h2 id="team-invite-title">Invite a team member</h2>
                <p>Enter their work email, then choose the access that matches their job.</p>
              </div>
              <button
                type="button"
                aria-label="Close invitation"
                onClick={() => setInviteOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            <form onSubmit={inviteMember}>
              <label className="auth-field">
                <span>
                  <MailPlus size={13} /> Work email
                </span>
                <input
                  autoFocus
                  required
                  type="email"
                  placeholder="name@restaurant.com"
                  value={invite}
                  onChange={(event) => setInvite(event.target.value)}
                />
              </label>
              <fieldset className="team-role-picker">
                <legend>Choose a role</legend>
                {[
                  {
                    value: "waiter",
                    label: "Waiter",
                    note: "Orders, tables and guest requests",
                    icon: <ConciergeBell size={17} />,
                  },
                  {
                    value: "chef",
                    label: "Chef",
                    note: "Kitchen queue and preparation",
                    icon: <ChefHat size={17} />,
                  },
                  {
                    value: "host",
                    label: "Host",
                    note: "Reservations and table flow",
                    icon: <UserCog size={17} />,
                  },
                  {
                    value: "manager",
                    label: "Manager",
                    note: "Full day-to-day operations",
                    icon: <ShieldCheck size={17} />,
                  },
                  {
                    value: "menu-editor",
                    label: "Menu editor",
                    note: "Menu content and availability",
                    icon: <BookOpen size={17} />,
                  },
                  {
                    value: "viewer",
                    label: "Viewer",
                    note: "Read-only restaurant access",
                    icon: <Eye size={17} />,
                  },
                ].map((role) => (
                  <label
                    className={inviteRole === role.value ? "is-selected" : ""}
                    key={role.value}
                  >
                    <input
                      type="radio"
                      name="invite-role"
                      value={role.value}
                      checked={inviteRole === role.value}
                      onChange={() => setInviteRole(role.value as Exclude<MembershipRole, "owner">)}
                    />
                    <span>{role.icon}</span>
                    <div>
                      <b>{role.label}</b>
                      <small>{role.note}</small>
                    </div>
                    <i>{inviteRole === role.value && <Check size={12} />}</i>
                  </label>
                ))}
              </fieldset>
              <footer>
                <button className="button" type="button" onClick={() => setInviteOpen(false)}>
                  Cancel
                </button>
                <button className="button button-primary" type="submit">
                  <MailPlus size={14} /> Send invitation
                </button>
              </footer>
            </form>
          </GlassModal>
        )}
      </AnimatePresence>
    </DashboardPanel>
  );
}

function SettingsSection({
  id,
  icon,
  title,
  note,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="modern-settings-section" id={id}>
      <header>
        <span>{icon}</span>
        <div>
          <h2>{title}</h2>
          <p>{note}</p>
        </div>
      </header>
      <div>{children}</div>
    </section>
  );
}
function Field({
  name,
  label,
  icon,
  value,
}: {
  name: string;
  label: string;
  icon: React.ReactNode;
  value: string;
}) {
  return (
    <label className="auth-field">
      <span>
        {icon}
        {label}
      </span>
      <input name={name} defaultValue={value} />
    </label>
  );
}
function SelectField({
  name,
  label,
  icon,
  value,
  options,
  values,
}: {
  name: string;
  label: string;
  icon: React.ReactNode;
  value: string;
  options: string[];
  values: string[];
}) {
  return (
    <label className="auth-field">
      <span>
        {icon}
        {label}
      </span>
      <select name={name} defaultValue={value}>
        {options.map((option, index) => (
          <option value={values[index]} key={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
function OperationToggle({
  icon,
  title,
  note,
  enabled,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  note: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`restaurant-operation-toggle ${enabled ? "is-enabled" : ""}`}
      onClick={onToggle}
      aria-pressed={enabled}
    >
      <span>{icon}</span>
      <div>
        <b>{title}</b>
        <small>{note}</small>
      </div>
      <i>
        <em />
      </i>
    </button>
  );
}
