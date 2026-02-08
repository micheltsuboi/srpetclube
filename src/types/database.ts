// =====================================================
// SR PET CLUBE - TypeScript Types
// =====================================================

// Enums
export type UserRole = 'superadmin' | 'admin' | 'staff' | 'customer'
export type PetSpecies = 'dog' | 'cat' | 'other'
export type PetSize = 'small' | 'medium' | 'large' | 'giant'
export type PetGender = 'male' | 'female'
export type ServiceCategory = 'banho' | 'tosa' | 'banho_tosa' | 'hotel' | 'creche' | 'combo' | 'veterinario' | 'outro'
export type AppointmentStatus = 'pending' | 'confirmed' | 'in_progress' | 'done' | 'canceled' | 'no_show'
export type PaymentMethod = 'cash' | 'credit' | 'debit' | 'pix' | 'credit_package'
export type ReportType = 'photo' | 'feeding' | 'activity' | 'health' | 'bath_start' | 'bath_end' | 'general'

// =====================================================
// Database Types
// =====================================================

export interface Organization {
    id: string
    name: string
    subdomain: string
    logo_url: string | null
    settings: OrganizationSettings
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface OrganizationSettings {
    business_hours: {
        open: string
        close: string
    }
    working_days: number[]
}

export interface Profile {
    id: string
    org_id: string | null
    email: string
    full_name: string | null
    phone: string | null
    role: UserRole
    avatar_url: string | null
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface TimeEntry {
    id: string
    user_id: string
    org_id: string
    clock_in: string
    clock_out: string | null
    justification: string | null
    created_at: string
}

export interface Customer {
    id: string
    org_id: string
    user_id: string | null
    name: string
    cpf: string | null
    phone_1: string | null
    phone_2: string | null
    email: string | null
    address: string | null
    neighborhood: string | null
    city: string | null
    instagram: string | null
    notes: string | null
    created_at: string
    updated_at: string
}

export interface Pet {
    id: string
    customer_id: string
    name: string
    species: PetSpecies
    breed: string | null
    color: string | null
    size: PetSize | null
    birth_date: string | null
    weight_kg: number | null
    is_neutered: boolean
    gender: PetGender | null
    medical_notes: string | null
    allergies: string | null
    temperament: string | null
    perfume_allowed: boolean
    accessories_allowed: boolean
    special_care: string | null
    photo_url: string | null
    vaccination_card_url: string | null
    last_vaccination_date: string | null
    next_vaccination_date: string | null
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface Service {
    id: string
    org_id: string
    name: string
    description: string | null
    base_price: number
    category: ServiceCategory
    duration_minutes: number
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface PricingMatrix {
    id: string
    service_id: string
    weight_min: number | null
    weight_max: number | null
    size: PetSize | null
    day_of_week: number | null
    fixed_price: number
    is_active: boolean
    created_at: string
}

export interface ServiceCredit {
    id: string
    pet_id: string
    org_id: string
    service_type: string
    total_quantity: number
    remaining_quantity: number
    unit_price: number | null
    total_paid: number | null
    purchased_at: string
    expires_at: string | null
    created_at: string
}

export interface Appointment {
    id: string
    pet_id: string
    service_id: string
    org_id: string
    staff_id: string | null
    customer_id: string | null
    scheduled_at: string
    started_at: string | null
    completed_at: string | null
    status: AppointmentStatus
    calculated_price: number | null
    final_price: number | null
    discount: number
    payment_method: PaymentMethod | null
    notes: string | null
    used_credit: boolean
    credit_id: string | null
    checklist: ChecklistItem[]
    created_at: string
    updated_at: string
}

export interface ChecklistItem {
    id: string
    label: string
    checked: boolean
}

export interface DailyReport {
    id: string
    appointment_id: string | null
    pet_id: string
    staff_id: string | null
    org_id: string
    photo_url: string | null
    video_url: string | null
    observation: string | null
    report_type: ReportType
    is_public: boolean
    created_at: string
}

// =====================================================
// Extended Types (with relations)
// =====================================================

export interface PetWithCustomer extends Pet {
    customer: Customer
}

export interface AppointmentWithDetails extends Appointment {
    pet: PetWithCustomer
    service: Service
    staff: Profile | null
}

export interface DailyReportWithDetails extends DailyReport {
    pet: Pet
    staff: Profile | null
}

export interface LowCreditAlert {
    credit_id: string
    pet_id: string
    pet_name: string
    customer_name: string
    service_type: string
    remaining: number
}

// =====================================================
// Form Types
// =====================================================

export interface CustomerFormData {
    name: string
    cpf?: string
    phone_1?: string
    phone_2?: string
    email?: string
    address?: string
    neighborhood?: string
    city?: string
    instagram?: string
    notes?: string
}

export interface PetFormData {
    customer_id: string
    name: string
    species: PetSpecies
    breed?: string
    color?: string
    size?: PetSize
    birth_date?: string
    weight_kg?: number
    is_neutered?: boolean
    gender?: PetGender
    medical_notes?: string
    allergies?: string
    temperament?: string
    perfume_allowed?: boolean
    accessories_allowed?: boolean
    special_care?: string
}

export interface AppointmentFormData {
    pet_id: string
    service_id: string
    scheduled_at: string
    staff_id?: string
    notes?: string
}

export interface Product {
    id: string
    org_id: string
    name: string
    category: string
    cost_price: number
    selling_price: number
    stock_quantity: number
    min_stock_threshold?: number
    expiration_date: string | null
    photo_url: string | null
    barcode?: string
    description?: string
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface Vaccine {
    id: string
    org_id: string
    name: string
    manufacturer: string
    description?: string
    target_animals: string[] // e.g. ['Cão', 'Gato']
    created_at: string
    updated_at: string
}

export interface VaccineBatch {
    id: string
    vaccine_id: string
    batch_number: string
    quantity: number
    cost_price: number
    selling_price: number
    expiration_date: string
    is_active: boolean
    created_at: string
}

export interface ProductFormData {
    name: string
    category: string
    cost_price: number
    selling_price: number
    stock_quantity: number
    expiration_date?: string
    photo_url?: string
    barcode?: string
    description?: string
}
