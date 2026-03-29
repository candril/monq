---
title: Pipeline Editor
description: Writing and running MongoDB aggregation pipelines in monq.
---

monq includes a full aggregation pipeline editor that integrates with your terminal editor (`$EDITOR`) and supports live reloading.

## Opening the pipeline editor

From any collection view, press `Ctrl+F` to open `pipeline.jsonc` in `$EDITOR`. The file uses JSONC format (JSON with comments) and ships with JSON Schema autocompletion when your editor supports it.

```jsonc
[
  // Stage 1: filter
  { "$match": { "status": "active" } },

  // Stage 2: group and count
  {
    "$group": {
      "_id": "$category",
      "count": { "$sum": 1 }
    }
  },

  // Stage 3: sort descending
  { "$sort": { "count": -1 } }
]
```

Save and quit your editor — monq runs the pipeline and displays the results immediately.

## Live reload with tmux

If you are working inside a tmux session, press `Ctrl+E` to open `pipeline.jsonc` in a new tmux split pane alongside monq. As you save changes in your editor, monq detects the file modification and re-runs the pipeline automatically.

If you are not inside tmux, `Ctrl+E` copies the path to `pipeline.jsonc` to your clipboard so you can open it in a separate terminal.

## Projection carry-through

Projection tokens from the simple query bar (e.g. `+name -_id`) are automatically applied on top of the pipeline's output, so you can filter columns without modifying the pipeline itself.

## Clearing the pipeline

Press `Backspace` in the collection view to clear the current pipeline and return to direct collection browsing.
