'use client'

import { useState } from 'react'

export type DateRange = 'today' | 'week' | 'month' | 'next_month' | 'all' | 'custom_month'

interface DateRangeFilterProps {
    value: DateRange
    onChange: (range: DateRange) => void
    showExtendedOptions?: boolean
    allLabel?: string
    customMonth?: string
    onCustomMonthChange?: (month: string) => void
}

export default function DateRangeFilter({
    value,
    onChange,
    showExtendedOptions = false,
    allLabel = 'Todos',
    customMonth = '',
    onCustomMonthChange
}: DateRangeFilterProps) {
    return (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
                type="button"
                onClick={() => onChange('today')}
                style={{
                    padding: '0.5rem 1rem',
                    background: value === 'today' ? '#2563EB' : '#E5E7EB',
                    color: value === 'today' ? 'white' : '#374151',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: value === 'today' ? 'bold' : 'normal',
                    transition: 'all 0.2s'
                }}
            >
                Hoje
            </button>
            <button
                onClick={() => onChange('week')}
                style={{
                    padding: '0.5rem 1rem',
                    background: value === 'week' ? '#2563EB' : '#E5E7EB',
                    color: value === 'week' ? 'white' : '#374151',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: value === 'week' ? 'bold' : 'normal',
                    transition: 'all 0.2s'
                }}
            >
                Esta Semana
            </button>
            <button
                type="button"
                onClick={() => onChange('month')}
                style={{
                    padding: '0.5rem 1rem',
                    background: value === 'month' ? '#2563EB' : '#E5E7EB',
                    color: value === 'month' ? 'white' : '#374151',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: value === 'month' ? 'bold' : 'normal',
                    transition: 'all 0.2s'
                }}
            >
                Este Mês
            </button>
            {showExtendedOptions && (
                <>
                    <button
                        type="button"
                        onClick={() => onChange('next_month')}
                        style={{
                            padding: '0.5rem 1rem',
                            background: value === 'next_month' ? '#2563EB' : '#E5E7EB',
                            color: value === 'next_month' ? 'white' : '#374151',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: value === 'next_month' ? 'bold' : 'normal',
                            transition: 'all 0.2s'
                        }}
                    >
                        Próximo Mês
                    </button>
                    <button
                        type="button"
                        onClick={() => onChange('all')}
                        style={{
                            padding: '0.5rem 1rem',
                            background: value === 'all' ? '#2563EB' : '#E5E7EB',
                            color: value === 'all' ? 'white' : '#374151',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: value === 'all' ? 'bold' : 'normal',
                            transition: 'all 0.2s'
                        }}
                    >
                        {allLabel}
                    </button>
                    {onCustomMonthChange && (
                        <input
                            type="month"
                            value={customMonth}
                            aria-label="Selecionar mês específico"
                            onChange={(e) => {
                                const selected = e.target.value
                                onCustomMonthChange(selected)
                                if (selected) {
                                    onChange('custom_month')
                                }
                            }}
                            style={{
                                padding: '0.45rem 0.75rem',
                                background: value === 'custom_month' ? '#2563EB' : '#E5E7EB',
                                color: value === 'custom_month' ? 'white' : '#374151',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: value === 'custom_month' ? 'bold' : 'normal',
                                fontSize: '0.9rem'
                            }}
                        />
                    )}
                </>
            )}
        </div>
    )
}

/**
 * Helper function to get start/end dates for a given range
 */
export function getDateRange(range: DateRange, customMonth?: string): { start: Date; end: Date } {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    switch (range) {
        case 'today':
            return {
                start: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0),
                end: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
            }

        case 'week':
            // Get start of week (Sunday)
            const dayOfWeek = today.getDay()
            const startOfWeek = new Date(today)
            startOfWeek.setDate(today.getDate() - dayOfWeek)
            startOfWeek.setHours(0, 0, 0, 0)

            const endOfWeek = new Date(startOfWeek)
            endOfWeek.setDate(startOfWeek.getDate() + 6)
            endOfWeek.setHours(23, 59, 59, 999)

            return { start: startOfWeek, end: endOfWeek }

        case 'month':
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0)
            const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59)

            return { start: startOfMonth, end: endOfMonth }

        case 'next_month':
            const startOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1, 0, 0, 0)
            const endOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0, 23, 59, 59)

            return { start: startOfNextMonth, end: endOfNextMonth }

        case 'custom_month':
            if (customMonth && /^\d{4}-\d{2}$/.test(customMonth)) {
                const [yearStr, monthStr] = customMonth.split('-')
                const year = parseInt(yearStr, 10)
                const monthIdx = parseInt(monthStr, 10) - 1
                return {
                    start: new Date(year, monthIdx, 1, 0, 0, 0),
                    end: new Date(year, monthIdx + 1, 0, 23, 59, 59)
                }
            }
            return {
                start: new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0),
                end: new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59)
            }

        case 'all':
            return {
                start: new Date(2020, 0, 1, 0, 0, 0),
                end: new Date(2099, 11, 31, 23, 59, 59)
            }

        default:
            return {
                start: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0),
                end: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
            }
    }
}
