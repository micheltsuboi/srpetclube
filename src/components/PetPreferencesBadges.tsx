'use client'

import React from 'react'

export interface PetPreferencesData {
    perfume_allowed?: boolean | null
    accessories_allowed?: boolean | null
    allergies?: string | null
    existing_conditions?: string | null
    special_care?: string | null
}

interface PetPreferencesBadgesProps {
    pet?: PetPreferencesData | null
}

export default function PetPreferencesBadges({ pet }: PetPreferencesBadgesProps) {
    if (!pet) return null

    const perfumeDenied = pet.perfume_allowed === false
    const accessoriesDenied = pet.accessories_allowed === false
    const allergies = pet.allergies?.trim() || ''
    const existingConditions = pet.existing_conditions?.trim() || ''
    const specialCare = pet.special_care?.trim() || ''

    const baseBadgeStyle: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        fontSize: '0.7rem',
        fontWeight: 600,
        padding: '2px 6px',
        borderRadius: '4px',
        lineHeight: 1.25,
        maxWidth: '100%',
        wordBreak: 'break-word'
    }

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.35rem' }}>
            <span
                style={{
                    ...baseBadgeStyle,
                    background: perfumeDenied ? 'rgba(239, 68, 68, 0.18)' : 'rgba(16, 185, 129, 0.14)',
                    border: `1px solid ${perfumeDenied ? 'rgba(239, 68, 68, 0.45)' : 'rgba(16, 185, 129, 0.35)'}`,
                    color: perfumeDenied ? '#fca5a5' : '#6ee7b7'
                }}
                title={perfumeDenied ? 'Não usar perfume' : 'Perfume permitido'}
            >
                {perfumeDenied ? '🚫 Sem Perfume' : '🌸 Perfume: Sim'}
            </span>

            <span
                style={{
                    ...baseBadgeStyle,
                    background: accessoriesDenied ? 'rgba(239, 68, 68, 0.18)' : 'rgba(59, 130, 246, 0.14)',
                    border: `1px solid ${accessoriesDenied ? 'rgba(239, 68, 68, 0.45)' : 'rgba(59, 130, 246, 0.35)'}`,
                    color: accessoriesDenied ? '#fca5a5' : '#93c5fd'
                }}
                title={accessoriesDenied ? 'Não colocar acessórios/laços' : 'Acessórios permitidos'}
            >
                {accessoriesDenied ? '🚫 Sem Acessórios' : '🎀 Acessórios: Sim'}
            </span>

            {allergies && (
                <span
                    style={{
                        ...baseBadgeStyle,
                        background: 'rgba(245, 158, 11, 0.18)',
                        border: '1px solid rgba(245, 158, 11, 0.45)',
                        color: '#fcd34d'
                    }}
                    title={`Alergias: ${allergies}`}
                >
                    ⚠️ Alergia: {allergies}
                </span>
            )}

            {existingConditions && (
                <span
                    style={{
                        ...baseBadgeStyle,
                        background: 'rgba(236, 72, 153, 0.16)',
                        border: '1px solid rgba(236, 72, 153, 0.4)',
                        color: '#f9a8d4'
                    }}
                    title={`Doença pré-existente: ${existingConditions}`}
                >
                    🩺 {existingConditions}
                </span>
            )}

            {specialCare && (
                <span
                    style={{
                        ...baseBadgeStyle,
                        background: 'rgba(148, 163, 184, 0.16)',
                        border: '1px solid rgba(148, 163, 184, 0.35)',
                        color: '#e2e8f0'
                    }}
                    title={`Outros cuidados: ${specialCare}`}
                >
                    📝 {specialCare}
                </span>
            )}
        </div>
    )
}
