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
        setSelectedFile(null); // Reset the selected file after upload
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
    <div>
      <h3>Pridať logo strediska</h3>
      <div>
        <label>
          Nahrať obrázok:
          <input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            ref={fileInputRef}
          />
        </label>
      </div>

      <button onClick={handleAddImages} disabled={loading}>
        {loading ? "Pridávam..." : "Pridať Obrázok"}
      </button>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
};

export default ImageUpload;
