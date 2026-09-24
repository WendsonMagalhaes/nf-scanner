"use client";

import { useCallback, useRef, useState } from "react";
import {
  UploadCloud,
  Loader2,
  Download,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  FileWarning,
} from "lucide-react";
import { buildFilename, sanitizeForFilename, type TipoDoc } from "@/lib/extract";
import { FILENAME_PATTERN } from "@/lib/app-info";
import { adicionarHistorico, lerAprendidos, memorizarFornecedor } from "@/lib/storage";

type Status = "pending" | "processing" | "done" | "error";

interface Row {
  id: string;
  file: File;
  status: Status;
  date: string; // dd-mm-aaaa
  nfNumber: string;
  supplier: string;
  /** NF-e (produto) ou NFS-e (serviço) */
  docType: TipoDoc;
  /** CNPJ do emitente (14 dígitos) — usado para memorizar correções de nome */
  cnpj?: string;
  /** "baixa" = dados extraídos sem confirmação (conferir); vira "alta" quando o usuário edita */
  confidence?: "alta" | "baixa";
  error?: string;
}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function Home() {
  const [rows, setRows] = useState<Row[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [zipping, setZipping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const pdfFiles = Array.from(fileList).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );
    if (pdfFiles.length === 0) return;

    const newRows: Row[] = pdfFiles.map((file) => ({
      id: newId(),
      file,
      status: "pending",
      date: "",
      nfNumber: "",
      supplier: "",
      docType: "NFe" as TipoDoc,
    }));

    setRows((prev) => [...prev, ...newRows]);
    newRows.forEach(processRow);
  }, []);

  async function processRow(row: Row) {
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, status: "processing" } : r))
    );

    try {
      const fd = new FormData();
      fd.append("file", row.file);
      fd.append("fornecedores", JSON.stringify(lerAprendidos()));
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Falha ao extrair dados do PDF");
      const data = await res.json();

      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
              ...r,
              status: "done",
              date: data.date ?? "",
              nfNumber: data.nfNumber ?? "",
              supplier: data.supplier ?? "",
              docType: (data.docType as TipoDoc) ?? "NFe",
              cnpj: data.supplierCnpj ?? undefined,
              confidence: data.confidence,
            }
            : r
        )
      );
    } catch (e) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, status: "error", error: "Não consegui ler este PDF" }
            : r
        )
      );
    }
  }

  function updateRow(id: string, patch: Partial<Row>) {
    // ao editar um campo, o usuário está conferindo os dados
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch, confidence: "alta" } : r))
    );
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function clearAll() {
    setRows([]);
  }

  function suggestedName(row: Row) {
    if (!row.date || !row.nfNumber || !row.supplier) return null;
    return buildFilename(row.date, row.nfNumber, row.supplier, row.docType);
  }

  const readyCount = rows.filter((r) => r.status === "done" && suggestedName(r)).length;

  async function downloadZip() {
    const ready = rows.filter((r) => r.status === "done" && suggestedName(r));
    if (ready.length === 0) return;

    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      const usedNames = new Set<string>();
      for (const row of ready) {
        let name = suggestedName(row)!;
        if (usedNames.has(name)) {
          const base = name.replace(/\.pdf$/i, "");
          let i = 2;
          while (usedNames.has(`${base} (${i}).pdf`)) i++;
          name = `${base} (${i}).pdf`;
        }
        usedNames.add(name);
        zip.file(name, row.file);
      }

      const blob = await zip.generateAsync({ type: "blob" });
      // registra no Histórico (tela /historico)
      adicionarHistorico(
        ready.map((r) => ({
          arquivoOriginal: r.file.name,
          nomeFinal: suggestedName(r)!,
          tipo: r.docType,
          data: r.date,
          numero: r.nfNumber,
          fornecedor: r.supplier,
        }))
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "notas-fiscais-renomeadas.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }

  return (
    <main className="px-4 py-10 sm:px-8 lg:px-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight">
            Renomear notas fiscais
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            Padrão: <span className="font-mono">{FILENAME_PATTERN}</span>
          </p>
        </div>

        {/* Área de upload */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors ${dragOver
              ? "border-clay bg-clay/5"
              : "border-ink/15 bg-white/50 hover:border-clay/50 hover:bg-white"
            }`}
        >
          <UploadCloud
            size={34}
            className={dragOver ? "text-clay" : "text-ink/40 group-hover:text-clay/70"}
          />
          <div>
            <p className="font-medium">
              Arraste os PDFs aqui ou clique para selecionar
            </p>
            <p className="mt-1 text-sm text-ink/50">
              Envie várias notas fiscais de uma vez. PDFs escaneados são lidos por
              OCR e podem levar alguns segundos cada.
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </div>

        {/* Lista de arquivos */}
        {rows.length > 0 && (
          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-ink/60">
                {rows.length} arquivo{rows.length > 1 ? "s" : ""} · {readyCount} pronto
                {readyCount !== 1 ? "s" : ""} para renomear
              </p>
              <button
                onClick={clearAll}
                className="text-sm text-ink/40 hover:text-clayDark"
              >
                Limpar tudo
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-sand/60 text-left text-xs uppercase tracking-wide text-ink/50">
                    <th className="px-4 py-3 font-medium">Arquivo original</th>
                    <th className="px-4 py-3 font-medium">Data</th>
                    <th className="px-4 py-3 font-medium">Tipo / Nº</th>
                    <th className="px-4 py-3 font-medium">Fornecedor</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const name = suggestedName(row);
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-ink/5 last:border-0 hover:bg-sand/30"
                      >
                        <td className="max-w-[180px] truncate px-4 py-3 text-ink/70">
                          {row.file.name}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={row.date}
                            onChange={(e) =>
                              updateRow(row.id, { date: e.target.value })
                            }
                            placeholder="dd-mm-aaaa"
                            className="w-24 rounded-md border border-ink/15 bg-white px-2 py-1 text-xs focus:border-clay focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <select
                              value={row.docType}
                              onChange={(e) =>
                                updateRow(row.id, { docType: e.target.value as TipoDoc })
                              }
                              className="rounded-md border border-ink/15 bg-white px-1 py-1 text-xs focus:border-clay focus:outline-none"
                            >
                              <option value="NFe">NF-e</option>
                              <option value="NFSe">NFS-e</option>
                            </select>
                            <input
                              value={row.nfNumber}
                              onChange={(e) =>
                                updateRow(row.id, {
                                  nfNumber: e.target.value.replace(/\D/g, ""),
                                })
                              }
                              placeholder="000372196"
                              className="w-24 rounded-md border border-ink/15 bg-white px-2 py-1 text-xs focus:border-clay focus:outline-none"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={row.supplier}
                            onChange={(e) =>
                              updateRow(row.id, { supplier: e.target.value })
                            }
                            onBlur={() => memorizarFornecedor(row.cnpj, row.supplier)}
                            placeholder="FORNECEDOR LTDA"
                            className="w-40 rounded-md border border-ink/15 bg-white px-2 py-1 text-xs focus:border-clay focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-3">
                          {row.status === "processing" && (
                            <span className="inline-flex items-center gap-1 text-xs text-ink/50">
                              <Loader2 size={14} className="animate-spin" /> lendo
                            </span>
                          )}
                          {row.status === "done" && name && row.confidence !== "baixa" && (
                            <span className="inline-flex items-center gap-1 text-xs text-moss">
                              <CheckCircle2 size={14} /> pronto
                            </span>
                          )}
                          {row.status === "done" && name && row.confidence === "baixa" && (
                            <span
                              className="inline-flex items-center gap-1 text-xs text-clayDark"
                              title="Não consegui confirmar todos os campos no PDF. Confira antes de baixar."
                            >
                              <AlertTriangle size={14} /> conferir dados
                            </span>
                          )}
                          {row.status === "done" && !name && (
                            <span className="inline-flex items-center gap-1 text-xs text-clayDark">
                              <AlertTriangle size={14} /> revisar campos
                            </span>
                          )}
                          {row.status === "error" && (
                            <span className="inline-flex items-center gap-1 text-xs text-red-600">
                              <FileWarning size={14} /> erro na leitura
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => removeRow(row.id)}
                            className="text-ink/30 hover:text-red-600"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Prévia dos nomes finais */}
            {readyCount > 0 && (
              <div className="mt-4 rounded-xl border border-moss/20 bg-moss/5 px-4 py-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-moss">
                  Prévia dos nomes finais
                </p>
                <ul className="space-y-1 text-xs text-ink/70">
                  {rows
                    .filter((r) => r.status === "done" && suggestedName(r))
                    .slice(0, 5)
                    .map((r) => (
                      <li key={r.id} className="truncate font-mono">
                        {suggestedName(r)}
                      </li>
                    ))}
                  {readyCount > 5 && (
                    <li className="text-ink/40">+ {readyCount - 5} outros...</li>
                  )}
                </ul>
              </div>
            )}

            <button
              onClick={downloadZip}
              disabled={readyCount === 0 || zipping}
              className="mt-5 flex items-center gap-2 rounded-xl bg-clay px-5 py-3 text-sm font-medium text-paper shadow-sm transition-colors hover:bg-clayDark disabled:cursor-not-allowed disabled:opacity-40"
            >
              {zipping ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Download size={16} />
              )}
              Baixar {readyCount > 0 ? readyCount : ""} arquivo
              {readyCount !== 1 ? "s" : ""} renomeado{readyCount !== 1 ? "s" : ""} (.zip)
            </button>
          </div>
        )}
      </div>
    </main>
  );
}