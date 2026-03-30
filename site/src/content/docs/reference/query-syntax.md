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

### Ranges

Use `field:lo..hi` to express a range with a single token. Either bound can be omitted.

```
age:18..65                      → { "age": { "$gte": 18, "$lte": 65 } }
age:..65                        → { "age": { "$lte": 65 } }
age:18..                        → { "age": { "$gte": 18 } }
price:10.5..99.99               → { "price": { "$gte": 10.5, "$lte": 99.99 } }
```

### Dates

Date strings are automatically coerced to MongoDB `ISODate` values. `YYYY-MM-DD` is treated as start-of-day UTC.

```
createdAt:2025-01-15            → { "createdAt": ISODate("2025-01-15T00:00:00.000Z") }
createdAt>2025-01-01            → { "createdAt": { "$gt": ISODate("2025-01-01T00:00:00.000Z") } }
createdAt>=2025-01-01T12:00:00Z → { "createdAt": { "$gte": ISODate("2025-01-01T12:00:00.000Z") } }
createdAt!=2025-06-15           → { "createdAt": { "$ne": ISODate("2025-06-15T00:00:00.000Z") } }
```

Date ranges use the same `lo..hi` shorthand. The upper bound gets end-of-day (`23:59:59.999Z`) when written as a date-only string.

```
createdAt:2025-01-01..2025-12-31  → $gte 2025-01-01T00:00:00Z, $lte 2025-12-31T23:59:59.999Z
createdAt:2025-06-01..            → on or after 2025-06-01
```

#### Relative date expressions

Evaluated at query time (UTC). Useful for always-fresh filters.

| Expression | Meaning |
|------------|---------|
| `now` | Current instant |
| `today` | Start of current UTC day |
| `ago(Nd)` | N days ago |
| `ago(Nw)` | N weeks ago |
| `ago(Nm)` | N calendar months ago |
| `ago(Nh)` | N hours ago |
| `in(Nd)` | N days from now |
| `in(Nw)` | N weeks from now |
| `in(Nm)` | N calendar months from now |
| `in(Nh)` | N hours from now |

```
createdAt>ago(7d)               → created in the last 7 days
createdAt>today                 → created since start of today
createdAt:ago(1m)..today        → last month up to start of today
expiresAt<in(7d)                → expires within the next 7 days
scheduledAt:now..in(1w)         → scheduled between now and 7 days from now
```

### Negation and null

```
-status:deleted                 → { "status": { "$ne": "deleted" } }
email:null                      → { "email": null }
email:exists                    → { "email": { "$exists": true } }
email:!exists                   → { "email": { "$exists": false } }
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
