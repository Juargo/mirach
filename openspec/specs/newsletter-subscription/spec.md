# newsletter-subscription Specification

## Purpose

Client-side email capture form that submits to a third-party SaaS (ConvertKit/Mailchimp) via direct form action POST. No backend integration, no NestJS.

## Requirements

### Requirement: Email Input Form

The newsletter section MUST render an email input and submit button.

#### Scenario: Form renders

- GIVEN the newsletter section
- WHEN the page loads
- THEN an email input and submit button MUST be visible and keyboard-focusable

#### Scenario: Empty submission

- GIVEN the input is empty
- WHEN the user clicks submit
- THEN a validation error MUST appear near the input
- AND the form MUST NOT POST to the third-party SaaS

#### Scenario: Invalid email format

- GIVEN the input contains text that is not a valid email
- WHEN the user submits
- THEN an email format error MUST appear near the input
- AND the form MUST NOT POST

### Requirement: Third-Party SaaS Submission

A valid email MUST be sent to the configured third-party action URL via POST.

#### Scenario: Valid email submitted

- GIVEN a valid email in the input
- WHEN the user submits
- THEN the form MUST POST to the configured action URL
- AND include the email field in the request body

#### Scenario: Network failure

- GIVEN a valid email
- WHEN the POST fails due to network error
- THEN the form MUST display a generic submission error
- AND the email MUST remain in the input

### Requirement: Success/Error Feedback

The form MUST display distinct states: idle, success, validation error, and submission error.

#### Scenario: Success feedback

- GIVEN a successful submission response
- THEN the form MUST show a success confirmation message
- AND clear the email input

#### Scenario: Submission error distinct from validation

- GIVEN a failed POST request
- THEN the form MUST show a submission error message visually distinct from validation errors

### Requirement: Privacy Notice

A privacy notice MUST be visible near the submit button.

#### Scenario: Notice renders

- GIVEN the newsletter form
- WHEN it renders
- THEN a privacy notice with text about data handling MUST be visible adjacent to the submit button
