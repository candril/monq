# Paging

**Status**: Done

## Description

Paginate document list instead of loading all documents at once. Load N docs at a time, fetch more on scroll.

## Capabilities

### P1 - Must Have

- Fetch 50 documents at a time
- Load next page when scrolling near the bottom
- Show current page position in header (e.g. "1-50 / 1,200")

### P2 - Should Have

- Jump to page (G for last, gg for first)
- Configurable page size
