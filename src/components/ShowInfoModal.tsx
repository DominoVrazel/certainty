import React from "react";
import Modal from "./Modal";

interface ShowInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ShowInfoModal: React.FC<ShowInfoModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal show={isOpen} onClose={onClose}>
      <div className="info-modal-content">
        <h2 className="heading">Informácie</h2>
        <p>This is some plain text to display in the modal.</p>
      </div>
    </Modal>
  );
};

export default ShowInfoModal;
