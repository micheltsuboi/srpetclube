import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
    return await updateSession(request)
}

export const config = {
    matcher: [
        '/master-admin/:path*',
        '/owner/:path*',
        '/staff/:path*',
        '/tutor/:path*',
    ],
}
