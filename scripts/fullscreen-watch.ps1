# Detecta se a janela em primeiro plano esta em tela cheia (cobre a tela inteira,
# incluindo a area da barra de tarefas). Imprime "1" ou "0" a cada 2s.
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class FSWatch {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);
}
"@

$skip = @('Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd')

while ($true) {
  $fs = "0"
  try {
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $h = [FSWatch]::GetForegroundWindow()
    if ($h -ne [IntPtr]::Zero) {
      $sb = New-Object System.Text.StringBuilder 256
      [void][FSWatch]::GetClassName($h, $sb, 256)
      if ($skip -notcontains $sb.ToString()) {
        $r = New-Object FSWatch+RECT
        if ([FSWatch]::GetWindowRect($h, [ref]$r)) {
          # Janela maximizada nao cobre a barra de tarefas, entao nao entra aqui.
          if ($r.Left -le $bounds.X -and $r.Top -le $bounds.Y -and
              $r.Right -ge ($bounds.X + $bounds.Width) -and $r.Bottom -ge ($bounds.Y + $bounds.Height)) {
            $fs = "1"
          }
        }
      }
    }
  } catch {}
  [Console]::Out.WriteLine($fs)
  [Console]::Out.Flush()
  Start-Sleep -Seconds 2
}
