export const maskPhone = (value: string) => {
    if (!value) return ''
    value = value.replace(/\D/g, '')
    value = value.replace(/^(\d{2})(\d)/g, '($1) $2')
    value = value.replace(/(\d)(\d{4})$/, '$1-$2')
    return value.substring(0, 15) // (XX) XXXXX-XXXX
}
export const maskCPF = (value: string) => {
    if (!value) return ''
    value = value.replace(/\D/g, '')
    value = value.replace(/(\d{3})(\d)/, '$1.$2')
    value = value.replace(/(\d{3})(\d)/, '$1.$2')
    value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2')
    return value.substring(0, 14) // XXX.XXX.XXX-XX
}

export const getWhatsAppLink = (phone: string | null | undefined): string | null => {
    if (!phone) return null;
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) return null;
    if (cleanPhone.startsWith('55') && cleanPhone.length > 11) {
        return `https://wa.me/${cleanPhone}`;
    }
    return `https://wa.me/55${cleanPhone}`;
};
