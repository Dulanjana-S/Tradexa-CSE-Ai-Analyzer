# Frontend API map for alerts, notifications, announcements, settings, and admin

## Auth
- `GET /api/auth/me`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/change-password`
- `POST /api/profile`

## User
- `GET /api/watchlist`
- `POST /api/watchlist`
- `GET /api/preferences`
- `POST /api/preferences`
- `GET /api/settings`
- `POST /api/settings`

## Alerts
- `GET /api/alerts`
- `POST /api/alerts`
- `PATCH /api/alerts/{alert_id}`
- `DELETE /api/alerts/{alert_id}`

Supported alert types:
- `above_price`
- `below_price`
- `pct_move`
- `volume_spike`
- `important_announcement`

## Notifications
- `GET /api/notifications`
- `PATCH /api/notifications/{notification_id}/read`
- `POST /api/notifications/read-all`

## Announcements
- `GET /api/announcements?important_only=true`
- `GET /api/announcements?category=critical`

Response includes:
- `importance`
- `review_status`
- `tags`
- `review_notes`
- `reviewed_by`
- `reviewed_at`
- `is_important`

## Admin
- `GET /api/admin/status`
- `GET /api/admin/models`
- `POST /api/admin/models/{model_id}/activate`
- `GET /api/admin/users`
- `POST /api/admin/users/{username}/role`
- `POST /api/admin/actions/sync`
- `POST /api/admin/actions/train`
- `GET /api/admin/jobs`
- `GET /api/admin/provider`
- `POST /api/admin/provider`
- `GET /api/admin/alerts`
- `GET /api/admin/notifications`
- `GET /api/admin/announcements/review`
- `PATCH /api/admin/announcements/{ann_id}`
