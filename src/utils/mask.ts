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
