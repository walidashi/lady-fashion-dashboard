'use server'

import { revalidatePath } from 'next/cache'

export async function refreshInventory() {
  revalidatePath('/dashboard/admin/inventory')
}
