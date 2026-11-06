// Installer for the portal: QadisiyahPortal-Setup.exe carries the whole package (payload.zip) as an embedded resource.
// Installs per-user (no administrator needed) to %LOCALAPPDATA%\Programs\QadisiyahPortal, makes Desktop + Start-menu shortcuts and an
// "Apps & features" uninstall entry. "Setup.exe /uninstall" (copied into the install folder) removes it; the data folder is kept unless asked.
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

static class Setup
{
    const string Title = "بوابة تربية القادسية الإلكترونية", Key = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\QadisiyahPortal";
    static readonly string Dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "QadisiyahPortal");
    static string Desktop { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), Title + ".lnk"); } }
    static string StartMenu { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), Title + ".lnk"); } }
    const MessageBoxOptions Rtl = MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign;

    static DialogResult Ask(string t, MessageBoxButtons b, MessageBoxIcon i) { return MessageBox.Show(t, Title, b, i, MessageBoxDefaultButton.Button1, Rtl); }

    static void KillRunning()
    {
        foreach (var n in new[] { "QadisiyahPortal", "node" })
            foreach (var p in Process.GetProcessesByName(n))
            {
                try { var f = p.MainModule.FileName; if (f.StartsWith(Dir, StringComparison.OrdinalIgnoreCase)) { p.Kill(); p.WaitForExit(3000); } } catch { }
            }
    }

    static void Shortcut(string lnk, string target, string workDir)
    {
        // WScript.Shell cannot save under a non-ANSI file name: save as ASCII in temp, then move to the Arabic name
        var tmp = Path.Combine(Path.GetTempPath(), "qp-" + Guid.NewGuid().ToString("N") + ".lnk");
        var t = Type.GetTypeFromProgID("WScript.Shell"); object sh = Activator.CreateInstance(t);
        object s = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, sh, new object[] { tmp });
        var st = s.GetType();
        st.InvokeMember("TargetPath", BindingFlags.SetProperty, null, s, new object[] { target });
        st.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, s, new object[] { workDir });
        st.InvokeMember("IconLocation", BindingFlags.SetProperty, null, s, new object[] { target + ",0" });
        st.InvokeMember("Save", BindingFlags.InvokeMethod, null, s, null);
        File.Copy(tmp, lnk, true); File.Delete(tmp);
    }

    static void Install()
    {
        if (Ask("سيتم تثبيت «" + Title + "» على هذا الجهاز.\r\nالمجلد: " + Dir + "\r\n\r\nهل تريد المتابعة؟", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        try
        {
            KillRunning();
            Directory.CreateDirectory(Dir);
            using (var res = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
            using (var zip = new ZipArchive(res, ZipArchiveMode.Read))
                foreach (var e in zip.Entries)
                {
                    var rel = e.FullName.Replace('\\', '/'); if (rel.StartsWith("QadisiyahPortal/")) rel = rel.Substring("QadisiyahPortal/".Length);
                    if (rel.Length == 0) continue;
                    var dest = Path.GetFullPath(Path.Combine(Dir, rel.Replace('/', '\\'))); if (!dest.StartsWith(Dir, StringComparison.OrdinalIgnoreCase)) continue;
                    if (rel.EndsWith("/")) { Directory.CreateDirectory(dest); continue; }
                    Directory.CreateDirectory(Path.GetDirectoryName(dest));
                    using (var o = File.Create(dest)) using (var i = e.Open()) i.CopyTo(o);
                }
            var setupCopy = Path.Combine(Dir, "Setup.exe"); File.Copy(Application.ExecutablePath, setupCopy, true);
            var exe = Path.Combine(Dir, "QadisiyahPortal.exe");
            Shortcut(Desktop, exe, Dir); Shortcut(StartMenu, exe, Dir);
            using (var k = Registry.CurrentUser.CreateSubKey(Key))
            {
                k.SetValue("DisplayName", Title); k.SetValue("DisplayIcon", exe); k.SetValue("Publisher", "المديرية العامة لتربية القادسية"); k.SetValue("InstallLocation", Dir);
                k.SetValue("UninstallString", "\"" + setupCopy + "\" /uninstall"); k.SetValue("NoModify", 1, RegistryValueKind.DWord); k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
        }
        catch (Exception ex) { try { File.WriteAllText(Path.Combine(Path.GetTempPath(), "qp-setup-error.txt"), ex.ToString()); } catch { } Ask("فشل التثبيت: " + ex.Message, MessageBoxButtons.OK, MessageBoxIcon.Error); return; }
        if (Ask("تم التثبيت بنجاح. أُضيف اختصار على سطح المكتب وفي قائمة ابدأ.\r\n\r\nهل تريد تشغيل البرنامج الآن؟", MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes)
            Process.Start(new ProcessStartInfo(Path.Combine(Dir, "QadisiyahPortal.exe")) { WorkingDirectory = Dir });
    }

    static void Uninstall()
    {
        if (Ask("هل تريد إزالة «" + Title + "» من هذا الجهاز؟", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        bool wipe = Directory.Exists(Path.Combine(Dir, "data")) && Ask("هل تريد أيضاً حذف البيانات والمرفقات (مجلد data)؟\r\nاختر «لا» للاحتفاظ بها.", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes;
        KillRunning();
        try { File.Delete(Desktop); File.Delete(StartMenu); Registry.CurrentUser.DeleteSubKeyTree(Key, false); } catch { }
        Ask("تمت الإزالة.", MessageBoxButtons.OK, MessageBoxIcon.Information);
        // delete after this process exits (Setup.exe lives inside the folder); the folder itself goes only when nothing (data) is left in it
        string d = "\"" + Dir + "\"";
        Func<string, string> q = n => "\"" + Path.Combine(Dir, n) + "\"";
        string cmd = wipe ? "rmdir /s /q " + d : "rmdir /s /q " + q("app") + " & rmdir /s /q " + q("runtime") + " & del /q " + q("QadisiyahPortal.exe") + " " + q("readme-ar.txt") + " " + q("Setup.exe") + " & rmdir " + d;
        Process.Start(new ProcessStartInfo("cmd.exe", "/c ping -n 3 127.0.0.1 >nul & " + cmd) { CreateNoWindow = true, UseShellExecute = false });
    }

    [STAThread]
    static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        if (args.Length > 0 && args[0].Equals("/uninstall", StringComparison.OrdinalIgnoreCase)) Uninstall(); else Install();
    }
}
