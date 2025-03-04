import React, { useState, useRef } from "react";
import { getStorage, ref, uploadBytes } from "firebase/storage";

interface ImageUploadProps {
  selectedResort: string | null;
  onImageUpload: (file: File) => void;
}

const ImageUpload: React.FC<ImageUploadProps> = ({
  selectedResort,
  onImageUpload,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string>("Nahrať obrázok...");

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        alert("Neplatný formát súboru. Prosím nahrajte obrázok.");
        return;
      }
      setSelectedFile(file);
      setFileName(file.name);
    }
  };

  const handleAddImages = async () => {
    if (selectedFile && selectedResort) {
      setLoading(true);
      setError(null);

      try {
        const storage = getStorage();
        const sanitizedResortName = selectedResort.replace(
          /[^a-zA-Z0-9]/g,
          "_"
        );
        const storageRef = ref(
          storage,
          `resorts/${sanitizedResortName}/logo/${selectedFile.name}`
        );
        await uploadBytes(storageRef, selectedFile);
        alert("Obrázok úspešne uložený!");
        onImageUpload(selectedFile);
        setSelectedFile(null);
        setFileName("Nahrať obrázok...");
      } catch (error) {
        console.error("Chyba pri ukladaní obrázka: ", error);
        setError("Chyba pri ukladaní obrázka:");
      } finally {
        setLoading(false);
      }
    } else {
      alert("Prosím vyberte stredisko a obrázok.");
    }
  };

  return (
    <div className="add-image-container">
      <h3 className="content-label">Pridať logo strediska</h3>
      <div>
        <label className="custom-file-upload">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            ref={fileInputRef}
            hidden
          />
          <span className="upload-icon">
            <i className="fa fa-upload" aria-hidden="true"></i>
          </span>{" "}
          {fileName}
        </label>
      </div>

      <button
        className="btn btn-primary"
        onClick={handleAddImages}
        disabled={loading}
      >
        {loading ? "Pridávam..." : "Pridať Obrázok"}
      </button>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
};

export default ImageUpload;
