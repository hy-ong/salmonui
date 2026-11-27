---
title: Remote events
description: A data source read per visible range with latency and abort, writes that apply at once and revert when the server rejects them, onDataLoad and onError, a custom loading indicator, setLoading, reloadEvents and the event query methods.
category: calendars
---

Every navigation reads the new range from the simulated server (600 ms);
moving on before it answers aborts the older read. The loading indicator is
`renderLoading`; "setLoading" shows it from code. Drag an event or edit it:
the change shows at once, pending until the server answers. Tick "Server
rejects writes" and edit again: the change reverts and `onError` reports
it. The query buttons read the events in view, the events of one day
(`getEvents({ start, end })`) and the dates of the view, all as your own
rows.
