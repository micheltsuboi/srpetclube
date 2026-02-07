---
description: Workflow para fazer push automático para o repositório Git
---

# Git Auto Push Workflow

Este workflow faz commit e push automático das alterações.

## Passos

// turbo-all

1. Verificar status do Git:
```bash
git status
```

2. Adicionar todas as alterações:
```bash
git add -A
```

3. Criar commit com mensagem descritiva:
```bash
git commit -m "feat: [descrição da alteração]"
```

4. Fazer push para o repositório remoto:
```bash
git push origin main
```

## Notas
- Substitua `main` pela branch correta se necessário
- A mensagem do commit deve seguir o padrão conventional commits:
  - `feat:` para novas funcionalidades
  - `fix:` para correções
  - `docs:` para documentação
  - `style:` para formatação
  - `refactor:` para refatoração
  - `chore:` para tarefas de manutenção
