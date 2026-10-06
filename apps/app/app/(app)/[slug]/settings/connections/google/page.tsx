import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { ConnectionPageLoading } from "../connection-page";
import { GmailMailbox } from "../gmail-mailbox";

export const metadata: Metadata = { title: "Correo de auspicios" };

export default function GoogleConnectionPage() {
	return (
		<Suspense fallback={<ConnectionPageLoading />}>
			<GoogleConnectionContent />
		</Suspense>
	);
}

async function GoogleConnectionContent() {
	const { user } = await requireSession();
	return (
		<GmailMailbox
			loginEmail={user.email}
			initialSender={
				user.email === "sebawitting@gmail.com" ? "sawitting@miuandes.cl" : ""
			}
		/>
	);
}
