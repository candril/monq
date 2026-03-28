# Toast Notifications

**Status**: Done

## Description

Transient status messages displayed in the bottom-right corner of the screen. Auto-dismiss after a short delay based on severity. Covers clipboard confirmations, edit/delete/insert success and error feedback, and general warnings.

## Out of Scope

- Persistent notification history
- User-dismissable toasts (click/keypress to close)
- Multiple stacked toasts (only one shown at a time)

## Capabilities

### P1 - Must Have (all done)

- Four severity levels: `info`, `success`, `warning`, `error` — each with a distinct colour and icon — **done**
- Auto-dismiss timers: info/success 2.5 s, warning 3 s, error 4 s — **done**
- Multi-line message support — **done**
- Triggered by: clipboard yank (OSC 52), document edit/insert/delete, pipeline parse errors — **done**

### P2 - Should Have

- Dismiss early with a key press — **not done**

## Key Files

- `src/components/Toast.tsx` — `Toast` component; `ToastMessage` type (`kind`, `message`)
- `src/state.ts` — `SHOW_MESSAGE` / `CLEAR_MESSAGE` actions; `message` field in `AppState`
- `src/App.tsx` — renders `<Toast>` when `state.message` is set
- `src/hooks/useKeyboardNav.ts` — dispatches `SHOW_MESSAGE` after clipboard ops, errors, etc.
