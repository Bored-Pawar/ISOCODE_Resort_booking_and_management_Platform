import { handleInbound } from "@/modules/enquiries";

export function POST(request: Request) {
  return handleInbound(request, "whatsapp");
}
