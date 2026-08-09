import { ContactsDirectory } from "@/components/v2/contacts-directory";
import { PageHeader } from "@/components/page-header";
import { getV2WorkspaceSnapshot } from "@/lib/v2/repository";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const { contacts } = await getV2WorkspaceSnapshot();
  return <div className="space-y-8"><PageHeader eyebrow="Base compartida" title="Contactos" /><ContactsDirectory contacts={contacts} /></div>;
}
