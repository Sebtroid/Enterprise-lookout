import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { requireSession } from "@/lib/session";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
	title: "Preparar Lookout",
};

export const instant = false;

export default async function OnboardingPage() {
	await requireSession();

	return (
		<AuthShell>
			<AuthHeading
				title="Prepara tu espacio"
				description="Reúne la base compartida de empresas y contactos. Después podrás crear tus trabajos y eventos."
			/>

			<OnboardingForm placeholder="Enterprise Lookout" />
		</AuthShell>
	);
}
