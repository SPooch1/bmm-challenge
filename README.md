# BMM Challenge

30-day Build More Margin challenge app — daily videos, exercises, journaling, and progress tracking for business owners.

## Live URLs

- **Participant app:** challenge.buildmoremargin.com
- **Admin dashboard:** dashboard.buildmoremargin.com

## Stack

- Vanilla JS + Firebase (Auth, Firestore, Hosting)
- PWA (installable, offline-capable)
- No framework, no build step

## Deploy

```
firebase deploy
```

## Firebase

- Project: `bmm-challenge-fd4fd`
- Auth: email/password
- Firestore: user progress, journal entries, admin data
- Hosting: serves `public/`

## Admin

Admin dashboard at `/dashboard.html` — manage participants, view engagement, export data. Requires `role: admin` in Firestore user doc.
