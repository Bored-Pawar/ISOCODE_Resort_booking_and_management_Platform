/** Guest sign up form fields and DPDP notice: one definition for /signup and booking step 2. */
export const GUEST_SIGN_UP_FIELDS = [
  { name: "name", label: "Full name", autoComplete: "name" },
  { name: "email", label: "Email", type: "email", autoComplete: "email" },
  { name: "phone", label: "Phone (optional)", type: "tel", autoComplete: "tel", required: false },
  {
    name: "password",
    label: "Password (8+ characters)",
    type: "password",
    autoComplete: "new-password",
  },
  {
    name: "confirmPassword",
    label: "Confirm password",
    type: "password",
    autoComplete: "new-password",
  },
];

export const GUEST_CONSENT_NOTICE =
  "I agree that Company A may store my name, email and phone to manage my bookings, as described in the privacy notice (DPDP Act 2023). I can ask for my data to be deleted at any time.";
