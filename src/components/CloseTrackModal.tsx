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
        <h2>Close Track</h2>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Enter closing reason"
          className="modal-textarea"
        />
        <div className="modal-actions">
          <button onClick={handleSubmit}>Submit</button>
        </div>
      </div>
    </Modal>
  );
};

export default CloseTrackModal;
