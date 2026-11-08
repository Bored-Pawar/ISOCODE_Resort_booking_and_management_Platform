import type { Classification } from "./schema";
export function safeTemplate(category: Classification["category"]): string {
  if (category === "room")
    return "Thank you for your enquiry. {{QUOTE}} Our reservations team will review your request.";
  if (category === "complaint")
    return "Thank you for telling us. We are sorry to hear about your experience. Our team will review your concern and follow up.";
  if (category === "wedding" || category === "offsite")
    return "Thank you for your event enquiry. Please share your preferred dates, guest count and requirements. Our sales team will follow up with the details.";
  return "Thank you for contacting us. Please share a little more about your request so our team can help.";
}
