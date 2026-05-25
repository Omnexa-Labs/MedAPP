# Maestro flows

End-to-end UI tests for the MedApp mobile app.

## Run

```
maestro test .maestro/
maestro test .maestro/<flow>.yaml      # single flow
```

Install Maestro: https://maestro.mobile.dev/getting-started/installing-maestro

## Conventions

- One flow file per user journey, named after the journey: `splash-to-home.yaml`, `sign-in.yaml`, `become-partner-cta.yaml`.
- Element selectors: prefer `testID` set on the React Native element over text matches (text changes with copy revisions). Use `id: "splash.getStarted"` in flows; in the screen, `<Pressable testID="splash.getStarted">`.
- A flow MUST start by launching the app fresh (`launchApp` with `clearState: true`) unless it's explicitly testing resumed-state behavior.
- Pre-test reset: a `before-each.yaml` can clear AsyncStorage / SecureStore via a custom URL scheme or an in-app debug hook if we ever need consistent fixtures.
- Don't put assertion-only flows alongside real journeys — put them in `.maestro/_smoke/` so it's clear they're synthetic.

## What's here today

Nothing. Real flows arrive once we have real screens (splash, sign-in, home). The folder exists so first flow lands without bikeshedding the location.
