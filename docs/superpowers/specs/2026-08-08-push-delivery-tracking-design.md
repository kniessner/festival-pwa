# Push delivery tracking in wp-admin

**Date:** 2026-08-08
**Status:** Approved

## Problem

Push notifications sent via `Festival_PWA_Push::send_to_all()` are fire-and-forget:
the per-subscription send reports from `WebPush::flush()` are inspected only to
prune expired subscriptions, then discarded. There's no visibility in wp-admin
into how many devices a given `pwa_notification` post's push actually reached.

## Scope

"Received" = **accepted by the push service** (FCM/Mozilla push service returned
success for that subscription), not confirmed-displayed-on-device. True delivery
confirmation would require new client-side code in `sw.js` (a fetch call after
`showNotification()`) and a new public REST endpoint — out of scope here; this
tracks what the existing send already tells us and discards today.

Multiple sends of the same post (re-checking "send as push" after unchecking,
or a scheduled-publish re-save) are logged as separate entries, not overwritten
— an accumulating per-post send log, not a single counter.

Posts sent before this feature ships have no log data — no backfill.

## Data flow

1. Admin checks "send as push" + publishes/schedules a `pwa_notification` post.
2. `class-notifications.php`'s `save()` or `on_scheduled_publish()` calls
   `Festival_PWA_Push::send_to_all()`.
3. `send_to_all()` loads all subscriptions, queues + flushes the push batch
   (unchanged), and now also tallies each report's outcome while iterating —
   returns a report array instead of void:
   ```php
   ['total' => 150, 'accepted' => 142, 'expired' => 3, 'failed' => 5]
   ```
   - `total`: subscriptions attempted this send
   - `accepted`: push service confirmed success (`$report->isSuccess()`)
   - `expired`: gone/unsubscribed — already pruned from the subscriptions table
     (existing `isSubscriptionExpired()` check, now also counted)
   - `failed`: attempted, neither accepted nor expired (transient errors)
   - Returns `null` if VAPID isn't configured or there are zero subscribers —
     no bogus zero-entry gets logged for a send that never happened.
4. The caller appends `['time' => time(), ...$report]` to post meta
   `_pwa_push_send_log` (a plain PHP array of entries; WP handles
   serialization) whenever `send_to_all()` returns non-null.

## Admin UI

- **List column** on the `pwa_notification` post list (new `manage_pwa_notification_posts_columns`
  / `manage_pwa_notification_posts_custom_column` hooks, following the existing
  pattern in `class-music.php`): cumulative `accepted`/`total` summed across every
  log entry, e.g. `289/300 · 2 sends`. Em-dash if the log is empty.
- **Edit-screen meta box**: extends the existing "Notification Settings" box
  (side context) with a small table under the two checkboxes, one row per send:
  date, `accepted/total`, and the expired/failed breakdown.

## Explicitly out of scope

- No client-side ack/receipt code in `sw.js`.
- No new public REST endpoint.
- No per-subscription-level log — aggregate counts per send only.
- No backfill for notifications sent before this ships.
