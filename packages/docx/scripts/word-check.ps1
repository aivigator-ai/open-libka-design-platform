<#
  Opens Word files in Microsoft Word (through COM, invisibly) and saves each one as PDF.

  Proves what a test cannot: that Word itself reads the file without asking to repair it. A file Word cannot
  read fails to open (Word reports nothing on screen: alerts are off). Each PDF is written next to its file as
  <name>.word.pdf, exported with Word's structure tags, for a look at how Word lays it out.

  Usage (Windows with Word installed; see docs/admin/word-and-libreoffice.md):
    powershell -ExecutionPolicy Bypass -File packages/docx/scripts/word-check.ps1 <file.docx> [<file.docx> ...]
  Exit code: 0 when every file opened and saved, 1 otherwise.
#>
param([Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)][string[]]$Files)

$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0   # wdAlertsNone
$failed = 0
try {
  foreach ($f in $Files) {
    $path = (Resolve-Path $f).Path
    $pdf = [System.IO.Path]::ChangeExtension($path, '.word.pdf')
    try {
      # Open(FileName, ConfirmConversions, ReadOnly): never repairs on its own, so a broken file fails here
      $doc = $word.Documents.Open($path, $false, $true)
      $pages = $doc.ComputeStatistics(2)   # wdStatisticPages
      $headings = 0
      foreach ($p in $doc.Paragraphs) { if ($p.OutlineLevel -lt 10) { $headings++ } }
      # wdExportFormatPDF; Word tags the structure by default
      $doc.ExportAsFixedFormat($pdf, 17)
      $doc.Close([ref]0)   # wdDoNotSaveChanges
      Write-Output "ok    $f ($pages pages, $headings headings) -> $([System.IO.Path]::GetFileName($pdf))"
    } catch {
      $failed++
      Write-Output "FAIL  $f : $($_.Exception.Message)"
    }
  }
} finally {
  $word.Quit([ref]0)
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
exit [int]($failed -gt 0)
