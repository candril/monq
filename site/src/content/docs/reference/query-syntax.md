---
title: Query Syntax
description: Reference for monq's simple query syntax and inline projection tokens.
---

monq's simple query mode lets you filter and project in a single query string — no separator needed. Open it with `/`.

## Filters

### Equality

```
Author:Peter                    → { "Author": "Peter" }
Author:Peter State:Closed       → { "Author": "Peter", "State": "Closed" }
```

### Comparisons

```
age>25                          → { "age": { "$gt": 25 } }
age>=18 age<65                  → { "age": { "$gte": 18, "$lt": 65 } }
```

### Negation and null

```
-status:deleted                 → { "status": { "$ne": "deleted" } }
email:null                      → { "email": null }
email:exists                    → { "email": { "$exists": true } }
```

### Regex

```
name:/^john/i                   → { "name": { "$regex": "^john", "$options": "i" } }
```

### Arrays

```
tags:[admin,user]               → { "tags": { "$in": ["admin", "user"] } }
-tags:[spam,bot]                → { "tags": { "$nin": ["spam", "bot"] } }
comments:size:0                 → { "comments": { "$size": 0 } }
```

### Nested fields

```
address.city:London             → { "address.city": "London" }
```

## Projection tokens

Projection tokens are written inline in the same query string.

| Token | Meaning |
|-------|---------|
| `+field` | Include field |
| `-field` | Exclude field (bare, no value) |

```
Author:Peter +name +email       → filter by Author, return only name and email
Author:Peter -_id -tags         → filter by Author, exclude _id and tags
+name +score -_id               → projection only, no filter
```

:::note
`-field:value` is a `$ne` filter, not a projection. Only a bare `-field` (no colon) is treated as exclusion.
:::

Projection tokens carry through automatically when you switch to BSON mode or the pipeline editor.
