// ============================================================
// URL MODAL — fetch and extract article text from a link.
// ============================================================

import { useState } from "react";
import { Link2, Loader2, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { scrapeUrl, ApiError } from "@/lib/api";

export interface UrlSuccess {
  text: string;
  siteName: string;
  wordCount: number;
  label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (payload: UrlSuccess) => void;
}

export default function UrlModal({ open, onOpenChange, onSuccess }: Props) {
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setUrlInput("");
    setError("");
    setLoading(false);
  };

  const handleFetch = async () => {
    const url = urlInput.trim();
    if (!url) {
      setError("Please enter a URL.");
      return;
    }
    if (!/^https?:\/\/.+/i.test(url)) {
      setError("Please enter a valid URL starting with http:// or https://");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await scrapeUrl(url);
      if (data.text) {
        onSuccess({
          text: data.text,
          siteName: data.site_name || "",
          wordCount: data.word_count,
          label: data.title || data.site_name || "article",
        });
        reset();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Scraping failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fetch article from URL</DialogTitle>
          <DialogDescription>
            Paste a news article link to automatically extract the text.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="url-input" className="sr-only">
            Article URL
          </Label>
          <Input
            id="url-input"
            type="url"
            placeholder="https://www.bbc.com/news/..."
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFetch()}
            autoFocus
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleFetch} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="animate-spin" /> Fetching…
              </>
            ) : (
              <>
                <Link2 /> Fetch article
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
