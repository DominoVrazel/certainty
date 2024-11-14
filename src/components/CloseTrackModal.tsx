import React, { useState } from "react";
import Modal from "./Modal";

interface CloseTrackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void; // Function to submit reason
}

const CloseTrackModal: React.FC<CloseTrackModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [reason, setReason] = useState("");

  const handleSubmit = () => {
    // Call the onSubmit function with the reason before clearing it
    onSubmit(reason);
    setReason(""); // Clear the reason for a clean state on modal close
    onClose(); // Close the modal
  };

  return (
    <Modal show={isOpen} onClose={onClose}>
      <div className="reservation-modal">
        <h4>Zavrieť trať</h4>
        <br></br>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Zadajte dôvod uzavretia trate"
              className="form-control"
              required
            />
          </div>
          <button className="RegButton" type="submit">
            Potvrdiť
          </button>
        </form>
      </div>
    </Modal>
  );
};

export default CloseTrackModal;
