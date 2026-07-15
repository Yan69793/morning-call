$ErrorActionPreference = "Stop"

$skills = @(
  @{
    Repo = "https://github.com/vercel-labs/agent-skills"
    Skill = "web-design-guidelines"
  },
  @{
    Repo = "https://github.com/anthropics/skills"
    Skill = "frontend-design"
  },
  @{
    Repo = "https://github.com/anthropics/skills"
    Skill = "webapp-testing"
  },
  @{
    Repo = "https://github.com/obra/superpowers"
    Skill = "verification-before-completion"
  },
  @{
    Repo = "https://github.com/pbakaus/impeccable"
    Skill = "impeccable"
  }
)

foreach ($entry in $skills) {
  Write-Host "Installing $($entry.Skill)..." -ForegroundColor Cyan
  npx skills add $entry.Repo --skill $entry.Skill -g -y
}

Write-Host ""
Write-Host "Done. Restart Codex to pick up new skills." -ForegroundColor Green
