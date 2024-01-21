# Minecraft-Artifact-Builder
## Konzept
* "Podman first" (später auch Docker-Kompatibilität)
  * Dadurch dass Podman by-default rootless laufen kann, targetten wir Podman und sorgen dafür, dass Permission/Requirements etc. stimmen
  * Wir wollen Container nutzen, für saubere Build Environments – Da ist Podman aus sicherheitstechnischer Sicht besonders interessant
* Jars/Artefakte werden in Containern gebaut (Podman)
* Es können beliebig viele Jar-Arten gebaut werden
    * Jede Jar-Art weiß wie sie sich baut, was sie im Container brauch, etc.
    * Gibt Tooling, um JDKs oder anderen kram zu installieren/zu setuppen
* Pro-Jar-Art können (optional) mehrere Artefakte als output "gesammelt" werden
    * Man kann eine Jar-Art als "Always-One-Artifact" markieren, was die Handhabung vereinfacht (und maybe vorerst auch nicht anders supportet ist?)
    * Artefakte müssen mit einem unique identifier versehen werden, welcher mitunter build-settings/-args enthält (unique für Jar-Art, nicht global)
* Pro-Jar-Art können (optional) mehrere Verzeichnisse als "Cached" markiert werden
* Global können für jede Jar-Art configs/settings hinterlegt werden
    * z.B. maven mirrors, die im Container dann automatisch in die config geschrieben werden
* Jar-Arten können Argumente definieren (required und optional)
    * Es gibt ein Standard-Set an Argumenten, die supporten werden sollten/müssen
        * z.B. version-to-build,
* Es gibt so etwas wie "Crons", welche in regelmäßigen Abständen einen Jar-Art-Build triggern können
    * z.B. mit version-to-build=all und skip-existing=true
* Man kann mehrere Artefakt-Ziele konfigurieren
    * Standard: Eine lokale Ordnerstruktur
    * Denkbare weitere Speicher: Maven Repository, S3 compatible cloud storage, ...
