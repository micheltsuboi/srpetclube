'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import sharp from 'sharp'

/**
 * Upload and optimize a photo for daily report
 * Resizes to max 1080px width, 70% quality, converts to WebP
 */
export async function uploadReportPhoto(formData: FormData) {
    try {
        const supabase = await createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { success: false, message: 'Não autorizado.' }
        }

        const file = formData.get('file') as File
        if (!file) {
            return { success: false, message: 'Nenhum arquivo enviado.' }
        }

        // Validate file type
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
        if (!validTypes.includes(file.type)) {
            return { success: false, message: 'Tipo de arquivo inválido. Use JPG, PNG ou WebP.' }
        }

        // Get org_id for path organization
        const { data: profile } = await supabase
            .from('profiles')
            .select('org_id')
            .eq('id', user.id)
            .single()

        if (!profile?.org_id) {
            return { success: false, message: 'Organização não encontrada.' }
        }

        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // Optimize image with sharp only if necessary or just to standardize
        // Using a more efficient approach for very small images
        let optimizedBuffer: Buffer
        const isSmallImage = file.size < 200 * 1024 // < 200KB
        const isModernFormat = ['image/webp', 'image/jpeg'].includes(file.type)

        if (isSmallImage && isModernFormat) {
            // Only convert to WebP if not already, but keep it simple
            optimizedBuffer = buffer
        } else {
            optimizedBuffer = await sharp(buffer)
                .resize(1080, null, {
                    withoutEnlargement: true,
                    fit: 'inside'
                })
                .webp({ quality: 65, effort: 2 }) // Lower effort = less CPU
                .toBuffer()
        }

        // Generate unique filename
        const timestamp = Date.now()
        const filename = `${profile.org_id}/${timestamp}.webp`
        const filepath = `daily-reports/${filename}`

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase
            .storage
            .from('daily-report-photos')
            .upload(filepath, optimizedBuffer, {
                contentType: 'image/webp',
                upsert: false
            })

        if (uploadError) {
            console.error('[Photo Upload] Storage error:', uploadError)
            return { success: false, message: 'Erro ao fazer upload da foto.' }
        }

        // Get public URL
        const { data: { publicUrl } } = supabase
            .storage
            .from('daily-report-photos')
            .getPublicUrl(filepath)

        return {
            success: true,
            url: publicUrl,
            message: 'Foto enviada com sucesso!'
        }

    } catch (error) {
        console.error('[Photo Upload] Unexpected error:', error)
        return { success: false, message: 'Erro ao processar imagem.' }
    }
}

/**
 * Delete a photo from storage
 */
export async function deleteReportPhoto(photoUrl: string) {
    try {
        const supabase = await createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { success: false, message: 'Não autorizado.' }
        }

        // Extract filepath from URL
        const filepath = photoUrl.split('/daily-report-photos/')[1]
        if (!filepath) {
            return { success: false, message: 'URL inválida.' }
        }

        const { error } = await supabase
            .storage
            .from('daily-report-photos')
            .remove([`daily-reports/${filepath}`])

        if (error) {
            console.error('[Photo Delete] Error:', error)
            return { success: false, message: 'Erro ao deletar foto.' }
        }

        return { success: true, message: 'Foto deletada.' }

    } catch (error) {
        console.error('[Photo Delete] Unexpected error:', error)
        return { success: false, message: 'Erro inesperado.' }
    }
}

/**
 * Create or update daily report
 */
export async function saveDailyReport(appointmentId: string, reportText: string, photoUrls: string[]) {
    try {
        const supabase = await createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { success: false, message: 'Não autorizado.' }
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('org_id')
            .eq('id', user.id)
            .single()

        if (!profile?.org_id) {
            return { success: false, message: 'Organização não encontrada.' }
        }

        const reportData = {
            appointment_id: appointmentId,
            org_id: profile.org_id,
            report_text: reportText,
            photos: photoUrls
        }

        // Upsert (create or update)
        const { error } = await supabase
            .from('appointment_daily_reports')
            .upsert(reportData, { onConflict: 'appointment_id' })

        if (error) {
            console.error('[Daily Report] Error:', error)
            return { success: false, message: 'Erro ao salvar relatório.' }
        }

        revalidatePath('/owner/creche')
        revalidatePath('/owner/banho-tosa')
        return { success: true, message: 'Relatório salvo com sucesso!' }

    } catch (error) {
        console.error('[Daily Report] Unexpected error:', error)
        return { success: false, message: 'Erro inesperado.' }
    }
}

/**
 * Get daily report for an appointment
 */
export async function getDailyReport(appointmentId: string) {
    try {
        const supabase = await createClient()

        const { data, error } = await supabase
            .from('appointment_daily_reports')
            .select('id, appointment_id, report_text, photos, created_at')
            .eq('appointment_id', appointmentId)
            .single()

        if (error) {
            if (error.code !== 'PGRST116') { // Not found is OK
                console.error('[Get Daily Report] Error:', error)
            }
            return null
        }

        return data

    } catch (error) {
        console.error('[Get Daily Report] Unexpected error:', error)
        return null
    }
}
