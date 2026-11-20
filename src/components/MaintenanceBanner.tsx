import { READ_ONLY } from "../services/maintenance";

/**
 * The strip across the top during the migration window.
 *
 * A club that finds the booking buttons missing and no explanation assumes the
 * site is broken and mails the resort — which is the resort's problem exactly
 * when the resort is busiest. One sentence prevents that.
 */
export default function MaintenanceBanner() {
  if (!READ_ONLY) return null;

  return (
    <div className="maintenance-banner" role="status" data-testid="maintenance-banner">
      <b>Prebieha údržba systému.</b> Kalendár si môžete prezerať, ale
      rezervácie sú na chvíľu pozastavené. Skúste to prosím o niekoľko minút.
    </div>
  );
}
