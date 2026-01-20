import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, FileUp, FileText, ChevronLeft, ChevronRight, Eye, Loader2, X, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/utils";
import { Layout } from "@/components/layout";

export interface DocumentType {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  processingStatus: "pending" | "processing" | "completed" | "failed";
  documentType: string;
  summary: string;
  extractedText: string;
  detectedFields: {
    dates: string[];
    names: string[];
    organizations: string[];
    amounts: string[];
    references: string[];
  };
  confidence: "high" | "medium" | "low";
  createdAt: string; // or Date
}

export default function AdminScreen() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 50;
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set());
  const [selectedDocument, setSelectedDocument] = useState<DocumentType | null>(null);

  // Fetch Documents
  const { data: documentsData, isLoading } = useQuery<{ total: number; data: DocumentType[] }>({
    queryKey: ["/api/documents", "v2"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/documents");
        const json = await res.json();
        return json;
      } catch (err) {
        console.error("Error fetching documents:", err);
        throw err;
      }
    },
    refetchInterval: 5000
  });

  const documents = documentsData?.data || [];

  // Render Loading
  if (isLoading && !documentsData) {
    return (
      <Layout activeTab="documents" onTabChange={() => { }}>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout activeTab="documents" onTabChange={() => { }}>
      <div className="space-y-6">

        {/* Upload Section */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-bold mb-4">Upload Documents</h2>
          <div className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
            <FileText className="w-12 h-12 mx-auto mb-4 text-gray-500" />
            <p className="text-gray-400 mb-2">Drop PDF, JPG, PNG, or WEBP files here</p>
            <p className="text-sm text-gray-500 mb-4">or click to browse (max 50MB per file)</p>
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              id="document-upload"
              onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                if (files.length === 0) return;

                const formData = new FormData();
                files.forEach(file => formData.append('files', file));

                try {
                  const res = await apiRequest('POST', '/api/documents/upload', formData);
                  const data = await res.json();
                  if (data.success) {
                    queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
                    toast.success("Documents uploaded successfully");
                  }
                } catch (error) {
                  console.error('Upload failed:', error);
                  toast.error('Upload failed');
                }
                e.target.value = '';
              }}
            />
            <Button
              onClick={() => document.getElementById('document-upload')?.click()}
              className="bg-primary text-black hover:bg-primary/80"
            >
              <FileUp className="w-4 h-4 mr-2" />
              Select Files
            </Button>
          </div>
        </div>

        {/* Documents Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="p-6 border-b border-gray-800 flex justify-between items-center">
            <h2 className="text-xl font-bold">Uploaded Documents</h2>
            {selectedDocumentIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  if (confirm(`Delete ${selectedDocumentIds.size} documents?`)) {
                    try {
                      await apiRequest('POST', '/api/documents/bulk-delete', { ids: Array.from(selectedDocumentIds) });
                      setSelectedDocumentIds(new Set());
                      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
                      toast.success(`${selectedDocumentIds.size} documents deleted`);
                    } catch (e) {
                      console.error(e);
                      toast.error("Failed to delete documents");
                    }
                  }
                }}
              >
                Delete Selected ({selectedDocumentIds.size})
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-800">
                <tr>
                  <th className="p-4 w-[50px]">
                    <input
                      type="checkbox"
                      className="rounded bg-gray-800 border-gray-700 text-primary focus:ring-primary"
                      checked={documents.length > 0 && selectedDocumentIds.size === documents.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedDocumentIds(new Set(documents.map((d: DocumentType) => d.id)));
                        } else {
                          setSelectedDocumentIds(new Set());
                        }
                      }}
                    />
                  </th>
                  <th className="text-left p-4">File Name</th>
                  <th className="text-left p-4">Type</th>
                  <th className="text-left p-4">Document Type</th>
                  <th className="text-left p-4">Status</th>
                  <th className="text-left p-4">Confidence</th>
                  <th className="text-left p-4">Uploaded</th>
                  <th className="text-left p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.length === 0 ? (
                  <tr className="border-t border-gray-800">
                    <td colSpan={8} className="p-8 text-center text-gray-500">
                      No documents uploaded yet. Upload your first document above.
                    </td>
                  </tr>
                ) : (
                  documents.map((doc: DocumentType) => (
                    <tr key={doc.id} className="border-t border-gray-800 hover:bg-gray-800/50">
                      <td className="p-4">
                        <input
                          type="checkbox"
                          className="rounded bg-gray-800 border-gray-700 text-primary focus:ring-primary"
                          checked={selectedDocumentIds.has(doc.id)}
                          onChange={(e) => {
                            const newSet = new Set(selectedDocumentIds);
                            if (e.target.checked) newSet.add(doc.id);
                            else newSet.delete(doc.id);
                            setSelectedDocumentIds(newSet);
                          }}
                        />
                      </td>
                      <td className="p-4 truncate max-w-[200px]" title={doc.fileName}>{doc.fileName}</td>
                      <td className="p-4 uppercase text-xs font-mono">{doc.fileType?.split('/')[1] || doc.fileType}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${doc.documentType === 'unknown' ? 'bg-gray-800 text-gray-400' : 'bg-blue-500/20 text-blue-400'}`}>
                          {doc.documentType || 'Pending'}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${doc.processingStatus === 'completed' ? 'bg-green-500/20 text-green-400' :
                          doc.processingStatus === 'failed' ? 'bg-red-500/20 text-red-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>
                          {doc.processingStatus || 'pending'}
                        </span>
                      </td>
                      <td className="p-4">
                        {doc.confidence && (
                          <span className={`text-xs ${doc.confidence === 'high' ? 'text-green-400' :
                            doc.confidence === 'medium' ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                            {doc.confidence.toUpperCase()}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-gray-500 text-xs">
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-4 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedDocument(doc)}
                        >
                          <Eye className="w-4 h-4 mr-2" /> View
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={async () => {
                            if (confirm('Delete this document?')) {
                              try {
                                await apiRequest('DELETE', `/api/documents/${doc.id}`);
                                queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
                                toast.success("Document deleted");
                              } catch (e) {
                                console.error(e);
                                toast.error("Failed to delete document");
                              }
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between p-4 border-t border-gray-800 bg-gray-900/50">
            <div className="text-xs text-gray-500">
              Showing {documents.length} items (Page {page})
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="h-8">
                <ChevronLeft className="w-4 h-4 mr-1" /> Prev
              </Button>
              <Button variant="outline" size="sm" disabled={documents.length < limit} onClick={() => setPage(p => p + 1)} className="h-8">
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>

      </div>

      {/* Document Details Modal */}
      {selectedDocument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-gray-800 flex justify-between items-start sticky top-0 bg-gray-900/95 backdrop-blur z-10">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">{selectedDocument.fileName}</h2>
                <p className="text-xs text-gray-500 font-mono">{selectedDocument.id}</p>
              </div>
              <button onClick={() => setSelectedDocument(null)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* STATUS BANNER */}
              <div className={`p-4 rounded-lg flex items-center gap-3 ${selectedDocument.processingStatus === 'completed' ? 'bg-green-500/10 border border-green-500/20 text-green-400' :
                selectedDocument.processingStatus === 'failed' ? 'bg-red-500/10 border border-red-500/20 text-red-400' :
                  'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400'
                }`}>
                {selectedDocument.processingStatus === 'completed' ? <CheckCircle className="w-5 h-5" /> :
                  selectedDocument.processingStatus === 'failed' ? <AlertCircle className="w-5 h-5" /> :
                    <Loader2 className="w-5 h-5 animate-spin" />}
                <span className="font-bold uppercase tracking-wider text-sm">{selectedDocument.processingStatus}</span>
              </div>

              {/* SUMMARY SECTION */}
              <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700/50">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">Document Summary</h3>
                <div className="prose prose-invert max-w-none">
                  <p className="leading-relaxed text-gray-200 whitespace-pre-wrap">
                    {selectedDocument.summary || "No summary available."}
                  </p>
                </div>
              </div>

              {/* DETAILS GRID */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-800/30 p-4 rounded-lg border border-gray-800">
                  <span className="text-xs font-bold text-gray-500 uppercase block mb-1">Type</span>
                  <span className="text-lg font-mono text-white capitalize">{selectedDocument.documentType}</span>
                </div>
                <div className="bg-gray-800/30 p-4 rounded-lg border border-gray-800">
                  <span className="text-xs font-bold text-gray-500 uppercase block mb-1">Status</span>
                  <span className="text-lg font-mono text-white capitalize">{selectedDocument.processingStatus}</span>
                </div>
                <div className="bg-gray-800/30 p-4 rounded-lg border border-gray-800">
                  <span className="text-xs font-bold text-gray-500 uppercase block mb-1">Extracted Dates</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedDocument.detectedFields?.dates?.length > 0 ? (
                      selectedDocument.detectedFields.dates.map((date, i) => (
                        <span key={i} className="px-2 py-1 bg-gray-700 rounded text-xs text-gray-300 font-mono">{date}</span>
                      ))
                    ) : <span className="text-gray-500 italic">-</span>}
                  </div>
                </div>
                <div className="bg-gray-800/30 p-4 rounded-lg border border-gray-800">
                  <span className="text-xs font-bold text-gray-500 uppercase block mb-1">Extracted Amounts</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedDocument.detectedFields?.amounts?.length > 0 ? (
                      selectedDocument.detectedFields.amounts.map((amt, i) => (
                        <span key={i} className="px-2 py-1 bg-emerald-900/50 text-emerald-400 rounded text-xs font-mono">{amt}</span>
                      ))
                    ) : <span className="text-gray-500 italic">-</span>}
                  </div>
                </div>
              </div>

              {/* RAW DATA */}
              <div className="mt-8">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Raw Extracted Data</h3>
                <pre className="bg-black/50 p-4 rounded-lg text-xs font-mono text-gray-500 overflow-x-auto border border-gray-800">
                  {JSON.stringify(selectedDocument, null, 2)}
                </pre>
              </div>

            </div>
            <div className="p-6 border-t border-gray-800 bg-gray-900/95 flex justify-end">
              <Button onClick={() => setSelectedDocument(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
