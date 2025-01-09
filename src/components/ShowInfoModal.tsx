import React, { useState } from "react";
import Modal from "./Modal";
import whatsapp_skupina_QR from "../assets/images/whatsapp_skupina_QR.png";
import zrusenie_mojej_rezervacie from "../assets/images/zrusenie_mojej_rezervacie.png";
import uprava_zmazanie_pridanej_rezervacie from "../assets/images/uprava_zmazanie_pridanej_rezervacie.png";
import uprava_zmazanie_pridanej_rezervacie_2 from "../assets/images/uprava_zmazanie_pridanej_rezervacie_2.png";
import uprava_mojej_rezervacie from "../assets/images/uprava_mojej_rezervacie.png";

interface ShowInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ShowInfoModal: React.FC<ShowInfoModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<string>("tab1");

  const renderContent = () => {
    switch (activeTab) {
      case "tab1":
        return (
          <div className="tab-content">
            <p className="article-heading">
              V prípade otázok píšte na emailovú adresu:{" "}
              <b>skola@bachledka.sk</b>{" "}
            </p>
            <p className="article-heading">
              Pre <b>najaktúalnejšie informácie</b> pridajte sa do našej{" "}
              <b>Whatsapp skupiny</b>.
            </p>
            <img
              src={whatsapp_skupina_QR}
              alt="Informative"
              className="info-image"
              style={{
                maxWidth: "100%",
                height: "auto",
                display: "block",
                marginTop: "-2vw",
              }}
            />
          </div>
        );
      case "tab2":
        return (
          <div className="tab-content">
            <h3 className="article-heading">
              Ak ste danú rezerváciu vytvorili.
            </h3>
            <p className="number-steps">
              1. jednoducho kliknite na tlačidlo{" "}
              <b>"zmazať svoju rezerváciu"</b>
            </p>
            <img
              src={zrusenie_mojej_rezervacie}
              alt="Informative"
              className="info-image"
              style={{
                maxWidth: "100%",
                height: "auto",
                display: "block",
                marginLeft: "auto",
                marginRight: "auto",
              }}
            />
            <h3 className="article-heading">
              Ak ste sa ku danej rezervácii pridali.
            </h3>
            <p className="number-steps">
              1. kliknite na tlačidlo <b>"editovať rezerváciu"</b>
            </p>
            <img
              src={uprava_zmazanie_pridanej_rezervacie}
              alt="Informative"
              className="info-image"
              style={{
                maxWidth: "100%",
                height: "auto",
                display: "block",
                marginLeft: "auto",
                marginRight: "auto",
              }}
            />
            <p className="number-steps">
              2. vyberte možnosť <b>"zmazať rezerváciu"</b>
            </p>
            <img
              src={uprava_zmazanie_pridanej_rezervacie_2}
              alt="Informative"
              className="info-image"
              style={{
                maxWidth: "100%",
                height: "auto",
                display: "block",
                marginLeft: "auto",
                marginRight: "auto",
                marginTop: "-1vw",
              }}
            />
          </div>
        );
      case "tab3":
        return (
          <div className="tab-content">
            <h3 className="article-heading">
              Ak ste danú rezerváciu vytvorili.
            </h3>
            <p className="number-steps">
              1. jednoducho kliknite na tlačidlo <b>"upraviť rezerváciu"</b>
            </p>
            <img
              src={uprava_mojej_rezervacie}
              alt="Informative"
              className="info-image"
              style={{
                maxWidth: "100%",
                height: "auto",
                display: "block",
                marginLeft: "auto",
                marginRight: "auto",
              }}
            />
            <h3 className="article-heading">
              Ak ste sa ku danej rezervácii pridali.
            </h3>
            <p className="number-steps">
              1. kliknite na tlačidlo <b>"editovať rezerváciu"</b>
            </p>
            <img
              src={uprava_zmazanie_pridanej_rezervacie}
              alt="Informative"
              className="info-image"
              style={{
                maxWidth: "100%",
                height: "auto",
                display: "block",
                marginLeft: "auto",
                marginRight: "auto",
              }}
            />
            <p className="number-steps">
              2. upravte svoju rezerváciu a kliknite na tlačidlo <b>"Uložiť"</b>
            </p>
            <img
              src={uprava_zmazanie_pridanej_rezervacie_2}
              alt="Informative"
              className="info-image"
              style={{
                maxWidth: "100%",
                height: "auto",
                display: "block",
                marginLeft: "auto",
                marginRight: "auto",
                marginTop: "-1vw",
              }}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Modal show={isOpen} onClose={onClose}>
      <div className="info-modal-content">
        <h2 className="info-modal-heading">Návod ako postupovať</h2>
        <div className="tabs-menu">
          <button
            className="tabs-menu-button"
            onClick={() => setActiveTab("tab1")}
          >
            Úvod
          </button>
          <button
            className="tabs-menu-button"
            onClick={() => setActiveTab("tab2")}
          >
            Zrušenie rezervácie
          </button>
          <button
            className="tabs-menu-button"
            onClick={() => setActiveTab("tab3")}
          >
            Úprava rezervácie
          </button>
        </div>
        <div className="tab-content">{renderContent()}</div>
        {/* <p>This is some plain text to display in the modal.</p>
        <img
          src={whatsapp_skupina_QR}
          alt="Informative"
          className="info-image"
        /> */}
      </div>
    </Modal>
  );
};

export default ShowInfoModal;
