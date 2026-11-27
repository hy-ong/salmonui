---
title: Carousel templates
description: An onboarding carousel with text Back and Next buttons from renderPreviousButton and renderNextButton, numbered indicators from renderIndicator, and a loop switch.
category: navigation
---

- The Back and Next buttons come from `renderPreviousButton` /
  `renderNextButton`; the context gives their accessible `label`, the
  `disabled` state and `go()`.
- The numbered buttons come from `renderIndicator` (`{ index, selected,
  label, go }`).
- With **Loop** off (the default is `loop={true}`), Back is disabled on the
  first step and Next on the last. Turn it on and Next on the last step
  jumps back to the first.
