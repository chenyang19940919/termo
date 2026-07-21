; electron-builder 會自動載入這個檔案（約定路徑 build/installer.nsh），
; customInstall/customUnInstall 是它預留的 hook macro，分別在安裝/解除安裝時執行。
; 寫在 HKCU 而不是 HKLM，是因為這個 NSIS 設定是 perMachine:false（預設值）的單使用者安裝，
; 不需要 admin 權限，跟 VS Code/Windows Terminal 右鍵選單的做法一致。
!macro customInstall
  WriteRegStr HKCU "Software\Classes\Directory\shell\Termo" "" "在 Termo 開啟"
  WriteRegStr HKCU "Software\Classes\Directory\shell\Termo" "Icon" "$INSTDIR\Termo.exe"
  WriteRegStr HKCU "Software\Classes\Directory\shell\Termo\command" "" '"$INSTDIR\Termo.exe" --open-path "%V"'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Termo" "" "在 Termo 開啟"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Termo" "Icon" "$INSTDIR\Termo.exe"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Termo\command" "" '"$INSTDIR\Termo.exe" --open-path "%V"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Directory\shell\Termo"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\Termo"
!macroend
