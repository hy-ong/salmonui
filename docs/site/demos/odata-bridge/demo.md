---
title: OData bridge transport
description: A user-written transport maps Salmon UI protocol reads to an OData-style GET ($orderby, $skip, $top, $count, $select) and the OData body back to tuples; the same pattern bridges Web API, OData and GraphQL backends.
---

The `/api/odata/orders` endpoint is `docs/site/lib/demo-api.ts`, served by a Next.js route handler on a server and run in the browser tab on the static site; the transport is in the demo source.
